# fhir-smart-app

電子カルテ([fhir-client](../fhir-client))向けの臨床スコア計算。2 つの入口がある。

- **SMART アプリ**(`apps/web`): カルテの「SMARTアプリ」タブから SMART App Launch(EHR launch)で起動する。
  病名・検査値・バイタル・年齢性別から eGFR・CHA₂DS₂-VASc・qSOFA を自動で埋めて計算し、結果を `Observation` として書き戻す
- **CDS サービス**(`apps/cds`): CDS Hooks 2.0 の `patient-view`。カルテを開いたときに同じ計算をして、基準を超えたものをカードで知らせる。
  カードの「臨床スコアで開く」は `appContext` で該当のタブを指定して SMART アプリを起動する

- サーバーを持たない public client の SPA(PKCE)。トークンはブラウザの sessionStorage にだけ置く
- 認可・FHIR API は上流 [fhir-server](../fhir-server) と直接やり取りする(カルテは launch の発行だけ)
- 計算式は EHR を知らない純粋関数で、FHIR のどのコードから値を取るかは対応表(`packages/scores/src/codes.ts` と各計算式の `matchers`)だけで決まる

```
packages/scores/   計算式(純粋 TypeScript、依存なし)。入力の対応表・FHIR からの値の取り出し・検索の組み立て・レジストリ
apps/web/          Vite + React の SMART アプリ。launch.html(起動)→ index.html(画面)
apps/cds/          CDS Hooks サービス(Node の標準ライブラリだけ。esbuild で 1 ファイルにまとめる)
```

計算式と FHIR 検索(`packages/scores/src/queries.ts`)は両方の入口で共有する。SMART アプリは実際の患者 id で検索し、
CDS サービスは同じ検索を prefetch のテンプレート(`{{context.patientId}}`)として discovery に載せる。

## 開発

Node 22(`.node-version`)。EHR(fhir-client)と上流(fhir-server)が Docker で動いている前提。

```bash
npm install
npm run dev          # SMART アプリ http://localhost:5180(EHR とは別オリジン)
npm run dev -w apps/cds   # CDS サービス http://localhost:5181/cds-services
npm run typecheck    # tsc -b
npm test             # vitest(計算式と CDS のカード判定)
npm run build        # apps/web/dist
npm run build -w apps/cds  # apps/cds/dist/server.js
```

dev サーバーは `Content-Security-Policy: frame-ancestors http://localhost:5173` を出す(環境変数 `EHR_ORIGIN` で変更)。
カルテの iframe に埋め込まれるにはこのヘッダが要り、`X-Frame-Options` は出さない。

## EHR への登録

1. 上流 fhir-server に OAuth クライアントを登録する(カルテの管理 > OAuth クライアント、または `POST /admin/oauth_clients`)。
   - 種類: アプリ連携(launch)・医療従事者(`user/`)・public
   - リダイレクト URI: `http://localhost:5180/`(本番はアプリのオリジン + `/`。末尾のスラッシュまで完全一致)
   - スコープ: `user/Patient.read user/Observation.read user/Condition.read user/Encounter.read launch launch/patient launch/encounter openid fhirUser`。
     書き戻しを使うなら `user/Observation.write` を足す
2. カルテの管理 > SMART アプリ に登録する。
   - 起動 URL: `http://localhost:5180/launch.html?client_id=<client_id>`
   - 表示: 埋め込み
   - 書き戻しを使う配布では起動 URL に `&scope=<要求するスコープ(URL エンコード)>` を付ける。
     アプリが要求するスコープは既定で読み取りだけ(`apps/web/src/smart/scope.ts`)で、登録済みの範囲を超えると認可サーバーが `invalid_scope` を返す

起動 URL のクエリは `iss` と `launch` が EHR から付くので、`client_id` と任意の `scope` だけを登録する。

## CDS サービス

| パス | 内容 |
|---|---|
| `GET /cds-services` | discovery。`patient-view` のサービス `clinical-scores` と prefetch(Patient・病名・コードで絞った Observation・検体検査) |
| `POST /cds-services/clinical-scores` | カード(`{cards}`)。入力が古い・足りないときは出さない |
| `POST /cds-services/clinical-scores/feedback` | カードの採否。ログに残すだけ |

カードを出す基準(`apps/cds/src/rules.ts`):

| 計算式 | 使う値 | カード |
|---|---|---|
| qSOFA | 24 時間以内の呼吸数・収縮期血圧(GCS があれば使う) | 2 点以上で warning |
| eGFR | 90 日以内の血清クレアチニン | 45 未満で info、30 未満で warning |
| CHA₂DS₂-VASc | 活動中の心房細動(ICD-10 I48)があるときだけ計算 | 高リスク(男性 2 点以上・女性 3 点以上)で info |

prefetch で足りない key は、EHR が `fhirAuthorization` を渡したときだけ自分で上流を読んで補う。ログには患者を特定できる値を出さない。

環境変数:

| 名前 | 既定 | 内容 |
|---|---|---|
| `PORT` | 5181 | |
| `SMART_APP_LAUNCH_URL` | `http://localhost:5180/launch.html` | カードの smart リンク。EHR は登録済みの SMART アプリの起動 URL(クエリを除く)と照合してアプリを決める |
| `CDS_AUTH_TOKEN` | 空 | EHR が送る `Authorization: Bearer`。空なら検査しない(開発用) |
| `FHIR_BASE_URL` | 空 | `fhirAuthorization` で読むときの上流。空ならリクエストの `fhirServer` |

EHR への登録: カルテの管理 > CDS サービス に URL を登録する。dev の backend はコンテナの中なので
`http://host.docker.internal:5181`。本番は https で、認証トークンに `CDS_AUTH_TOKEN` と同じ値を入れる。

## 計算式を足す

1. `packages/scores/src/<name>.ts` に `ScoreDefinition` を書く(入力の対応表・`validate`・`compute`・書き戻す Observation のコード)
2. `packages/scores/src/registry.ts` の `SCORES` に 1 要素足す
3. `scores.test.ts` に期待値を足す

入力は 4 種: 年齢・性別(Patient)、数値(Observation の `valueQuantity`。血圧パネルの収縮期など `component` からも取れる)、
有無(Condition のコードが一致すれば初期値 ✓。活動中の病名だけ)。対応表の `code` は完全一致、`prefix` は前方一致(JLAC の分析物コード・ICD-10 の章)。

## 書き戻す Observation

- `category` = `survey`、`code` は計算式ごと(eGFR は LOINC 69405-9、CHA₂DS₂-VASc と qSOFA は LOINC に無いので `http://fhir-smart-app.local/CodeSystem/score`)
- `subject` は起動時の患者、`encounter` は launch で渡った受診、`performer` は `fhirUser`
- `interpretation[].text` に解釈(「G4」「高リスク」など)、`derivedFrom` に元にした Observation、`note` に解釈と内訳
- 「登録」ボタンは付与されたスコープに Observation の作成が含まれるときだけ出す
- 同じ日に同じ値をすでに登録していれば「登録済」で押せない。入力を直して値が変われば登録できる

各タブには、書き戻した結果を `category=survey` と計算式のコードで読み返し、前回値と直近 10 件の履歴を出す
(`packages/scores/src/history.ts`)。解釈は `interpretation` が無い古い記録では `note` の 1 行目から読む。
取消(`entered-in-error`)になった記録は出さない。

## EHR 側の制約(fhir-client の `docs/smart-app-launch-design.md`)

- EHR launch のみ。患者なし起動・医療者の standalone ログインは無い
- `offline_access` は要求しない(`invalid_scope` になる)
- launch は 1 回しか使えないので、iframe 内で再読み込みすると失敗する。アプリは「再起動」を案内する
- `aud` は issuer と完全一致(dev は `http://localhost:3000`。`127.0.0.1` は不可)
- `Binary` は `<img>` で直接読めない(上流の CORP)。使うなら `fetch` + Blob URL

## 本番(Render、`render.yaml`)

- SMART アプリ: static site。`headers` で `frame-ancestors` に EHR のオリジンを出す。`launch.html` と `/` の両方が同じ `dist` から配信される
- CDS サービス: web service(Node)。`CDS_AUTH_TOKEN` と `SMART_APP_LAUNCH_URL` を設定する
