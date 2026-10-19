# fhir-smart-app

電子カルテ([fhir-client](../fhir-client))の「アプリ」タブから SMART App Launch(EHR launch)で起動する臨床スコア計算アプリ。
病名・検査値・バイタル・年齢性別から eGFR・CHA₂DS₂-VASc・qSOFA を自動で埋めて計算し、結果を `Observation` として書き戻す。

- サーバーを持たない public client の SPA(PKCE)。トークンはブラウザの sessionStorage にだけ置く
- 認可・FHIR API は上流 [fhir-server](../fhir-server) と直接やり取りする(カルテは launch の発行だけ)
- 計算式は EHR を知らない純粋関数で、FHIR のどのコードから値を取るかは対応表(`packages/scores/src/codes.ts` と各計算式の `matchers`)だけで決まる

```
packages/scores/   計算式(純粋 TypeScript、依存なし)。入力の対応表・FHIR からの値の取り出し・レジストリ
apps/web/          Vite + React の SMART アプリ。launch.html(起動)→ index.html(画面)
```

## 開発

Node 22(`.node-version`)。EHR(fhir-client)と上流(fhir-server)が Docker で動いている前提。

```bash
npm install
npm run dev          # http://localhost:5180(EHR とは別オリジン)
npm run typecheck    # tsc -b
npm test             # vitest(計算式のテスト)
npm run build        # apps/web/dist
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

## 計算式を足す

1. `packages/scores/src/<name>.ts` に `ScoreDefinition` を書く(入力の対応表・`validate`・`compute`・書き戻す Observation のコード)
2. `packages/scores/src/registry.ts` の `SCORES` に 1 要素足す
3. `scores.test.ts` に期待値を足す

入力は 4 種: 年齢・性別(Patient)、数値(Observation の `valueQuantity`。血圧パネルの収縮期など `component` からも取れる)、
有無(Condition のコードが一致すれば初期値 ✓。活動中の病名だけ)。対応表の `code` は完全一致、`prefix` は前方一致(JLAC の分析物コード・ICD-10 の章)。

## 書き戻す Observation

- `category` = `survey`、`code` は計算式ごと(eGFR は LOINC 69405-9、CHA₂DS₂-VASc と qSOFA は LOINC に無いので `http://fhir-smart-app.local/CodeSystem/score`)
- `subject` は起動時の患者、`encounter` は launch で渡った受診、`performer` は `fhirUser`
- `derivedFrom` に元にした Observation、`note` に解釈と内訳
- 「登録」ボタンは付与されたスコープに Observation の作成が含まれるときだけ出す

## EHR 側の制約(fhir-client の `docs/smart-app-launch-design.md`)

- EHR launch のみ。患者なし起動・医療者の standalone ログインは無い
- `offline_access` は要求しない(`invalid_scope` になる)
- launch は 1 回しか使えないので、iframe 内で再読み込みすると失敗する。アプリは「再起動」を案内する
- `aud` は issuer と完全一致(dev は `http://localhost:3000`。`127.0.0.1` は不可)
- `Binary` は `<img>` で直接読めない(上流の CORP)。使うなら `fetch` + Blob URL

## 本番

Render の static site(`render.yaml`)。`headers` で `frame-ancestors` に EHR のオリジンを出す。
`launch.html` と `/` の両方が同じ `dist` から配信される。
