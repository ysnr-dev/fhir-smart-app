# 認証・認可とデータ取得の流れ

SMART アプリ(`apps/web`)と CDS サービス(`apps/cds`)が、電子カルテ(fhir-client)と上流 FHIR サーバー(fhir-server)の間で
どう認証・認可され、どこからデータを読むかをまとめる。EHR 側の設計は fhir-client の `docs/smart-app-launch-design.md` と
`docs/cds-hooks-design.md` が正典。

## 登場するもの

```mermaid
flowchart LR
  subgraph Browser["利用者のブラウザ"]
    EHRUI["カルテ画面<br/>(fhir-client frontend)"]
    APP["SMART アプリ<br/>(iframe、apps/web)"]
  end
  subgraph EHR["電子カルテ"]
    BE["fhir-client backend"]
  end
  subgraph FHIR["上流"]
    UP["fhir-server<br/>(FHIR API + OAuth 認可サーバー)"]
  end
  STATIC["静的ホスティング<br/>(apps/web/dist)"]
  CDS["CDS サービス<br/>(apps/cds)"]

  EHRUI -- "セッション Cookie + CSRF" --> BE
  BE -- "管理トークン / 施設トークン" --> UP
  BE -- "CDS Hooks(Bearer: 共有トークン)" --> CDS
  STATIC -- "HTML / JS の配信のみ" --> APP
  APP -- "OAuth(PKCE)と FHIR API(Bearer: アクセストークン)" --> UP
  CDS -. "fhirAuthorization があるときだけ" .-> UP
```

- SMART アプリは EHR の backend を通らず、上流と**ブラウザから直接**やり取りする。EHR の役目は launch の発行だけ。
- CDS サービスは EHR の backend からだけ呼ばれる。患者データは backend が prefetch で同梱して渡す。
- 静的ホスティングは HTML と JS を配るだけで、患者データは通らない。

## 使う資格情報

| 資格情報 | 持ち主 → 相手 | 寿命 | 用途 |
|---|---|---|---|
| セッション Cookie + CSRF | カルテ画面 → EHR backend | ログイン中 | 利用者(医療者)の認証 |
| 管理トークン(`X-FHIR-Admin-Token`) | EHR backend → 上流 | 固定(環境変数) | launch の発行(`/admin/launch_contexts`)、委任トークンの発行 |
| 施設トークン(SMART Backend Services、`system/`) | EHR backend → 上流 | 短命(`client_credentials` で取得) | 画面の中継と CDS の prefetch の FHIR 読み取り |
| launch トークン | 上流 → EHR → SMART アプリ → 上流 | 5 分・1 回限り | 起動の文脈(患者・受診・医療者・appContext)の受け渡し |
| 認可コード | 上流 → SMART アプリ | 5 分・1 回限り | トークンとの交換(PKCE の verifier と組) |
| アクセストークン(`user/`) | 上流 → SMART アプリ | 1 時間 | SMART アプリの FHIR 読み書き。登録スコープの範囲だけ |
| id_token | 上流 → SMART アプリ | — | `fhirUser`(ログイン中の医療者 `Practitioner/{id}`) |
| CDS 共有トークン(`CDS_AUTH_TOKEN`) | EHR backend → CDS | 固定(環境変数) | CDS サービスの呼び出し元の確認 |
| 委任トークン(`fhirAuthorization`) | 上流 → EHR → CDS | 5 分・読み取りのみ | CDS が prefetch で足りない分を自分で読む(提供元に委任クライアントを紐づけたときだけ) |

## SMART アプリ: EHR launch

```mermaid
sequenceDiagram
  autonumber
  actor U as 医療者
  participant K as カルテ画面
  participant B as EHR backend
  participant F as fhir-server
  participant A as SMART アプリ(iframe)

  U->>K: SMARTアプリ タブで「臨床スコア」を選ぶ
  K->>B: POST /smart_apps/:id/launch {patient_id, encounter_id?, app_context?}<br/>(セッション Cookie + CSRF)
  B->>F: POST /admin/launch_contexts {client_id, patient_id, encounter_id,<br/>practitioner_id, need_patient_banner, app_context}<br/>(管理トークン)
  F-->>B: {launch}(5 分・1 回限り)
  B-->>K: launch_url = 起動 URL?client_id=…&scope=…&iss=…&launch=…
  K->>A: iframe で launch.html を開く
  A->>F: GET /.well-known/smart-configuration(CORS)
  F-->>A: authorization_endpoint, token_endpoint, PKCE 対応
  Note over A: PKCE の verifier と state を作り sessionStorage に置く
  A->>F: GET /oauth/authorize?response_type=code&client_id&redirect_uri<br/>&scope&state&aud=iss&launch&code_challenge(S256)
  Note over F: launch を消費(client_id 一致・期限内・未使用)<br/>aud = issuer、スコープ ⊆ 登録スコープ<br/>ログイン・同意画面は出さない
  F-->>A: 302 redirect_uri?code&state
  A->>F: POST /oauth/token {code, code_verifier, client_id, redirect_uri}(CORS)
  F-->>A: access_token(1 時間)、scope、patient、encounter、<br/>need_patient_banner、appContext、id_token(fhirUser)
  Note over A: トークンは sessionStorage にだけ置く(fhirclient)
```

- **誰として認可されるか**: 医療者の本人確認は EHR のログインで済んでいる。上流は「管理トークンを持つ EHR が名乗った医療者」を信頼し、
  launch に `practitioner_id` を結びつける。上流側にログイン画面は無い。
- **何が許されるか**: 上流の OAuth クライアント登録のスコープが上限。アプリは起動 URL の `scope` で要求し、超えると `invalid_scope`。
  既定は読み取りだけで、書き戻す配布では `user/Observation.write` を登録と起動 URL の両方に足す。
- **断られるもの**: `offline_access`(長期の refresh)、`_history`・`AuditEvent`・`$export`(`user/` では 403)。
- **再読み込み**: launch と認可コードは 1 回限りなので、トークン取得前に iframe を再読み込みすると失敗する。カルテの「再起動」で新しい launch を出す。
  トークン取得後は fhirclient が sessionStorage から復元する。
- **React StrictMode**: `ready()` が 2 回走ると認可コードの二重交換で `invalid_grant` になるので、`smart/session.ts` で 1 回に限っている。

## SMART アプリ: データの取得と書き戻し

```mermaid
sequenceDiagram
  autonumber
  participant A as SMART アプリ
  participant F as fhir-server

  par 計算式の入力と履歴を並列に読む(Bearer: アクセストークン)
    A->>F: GET Patient/{patient}
  and
    A->>F: GET Observation?patient&code=<LOINC のカンマ OR>&_sort=-date&_count=200
  and
    A->>F: GET Observation?patient&category=laboratory&_sort=-date&_count=200
  and
    A->>F: GET Condition?patient&_count=200
  and
    A->>F: GET Observation?patient&category=survey&code=<計算式のコード>&_sort=-date
  end
  F-->>A: 結果(user/ スコープの範囲)
  Note over A: コード対応表で入力を埋める(JLAC11 の前方一致は手元で照合)<br/>計算 → 前回値・履歴を表示
  opt 「登録」(user/Observation.write があり、同じ日に同じ値が未登録のとき)
    A->>F: POST Observation {category: survey, code, subject, encounter,<br/>performer: fhirUser, value, interpretation, derivedFrom, note}
    F-->>A: 201(監査: アプリの client_id と医療者)
  end
```

- 読む範囲: `user/` のトークンは患者コンパートメントに閉じない(施設内の全患者を読める)。アプリは起動時の `patient` だけを読む。
- 検索の組み立ては `packages/scores/src/queries.ts` と `history.ts` に置き、CDS の prefetch と共有する。

## CDS サービス: patient-view

```mermaid
sequenceDiagram
  autonumber
  actor U as 医療者
  participant K as カルテ画面
  participant B as EHR backend
  participant F as fhir-server
  participant C as CDS サービス

  U->>K: 患者のカルテを開く
  K->>B: POST /integrations/cds/patient_view {patient_id, encounter_id?}<br/>(セッション Cookie + CSRF)
  B->>C: GET /cds-services(discovery、5 分キャッシュ)
  C-->>B: services[clinical-scores] と prefetch テンプレート
  Note over B: {{context.patientId}} を埋める
  par prefetch を解決(Bearer: 施設トークン)
    B->>F: GET Patient/{id}
  and
    B->>F: GET Observation?…(コード / 検体検査)
  and
    B->>F: GET Condition?…
  end
  F-->>B: 結果(許可リストの型だけ。満たせない key は省く)
  opt 提供元に委任クライアントを紐づけているとき
    B->>F: POST /admin/delegated_tokens {client_id, practitioner_id, patient_id}(管理トークン)
    F-->>B: fhirAuthorization(読み取りのみ・5 分)
  end
  B->>C: POST /cds-services/clinical-scores<br/>{hookInstance, hook, fhirServer, context{userId, patientId, encounterId},<br/>prefetch, fhirAuthorization?}(Bearer: CDS 共有トークン)
  opt prefetch に欠けがあり fhirAuthorization があるとき
    C->>F: GET(Bearer: 委任トークン)
    F-->>C: 結果
  end
  Note over C: 有効期間内の値で計算<br/>基準を超えたものだけカードにする
  C-->>B: {cards}(smart リンクに appContext={"score":…})
  Note over B: カードを正規化<br/>smart リンクは登録済みアプリの起動 URL と照合
  B-->>K: {cards, services}
  K->>U: 患者帯に「判断支援」
```

- **CDS が見る範囲**: 既定は backend が同梱した prefetch だけ。`fhirServer` の URL は届くが、委任トークンが無ければ上流は読めない。
- **呼び出し元の確認**: `CDS_AUTH_TOKEN` を設定すると、Bearer が一致しない呼び出しを 401 で断る(discovery は誰でも読める)。
- **失敗したとき**: 提供元が落ちている・10 秒を超える場合は、その提供元のカードが出ないだけでカルテは開ける。
- **ログ**: CDS サービスはサービス id・カード数・所要時間だけを出し、患者を特定できる値は出さない。

## CDS のカードから SMART アプリへ・無視の理由

```mermaid
sequenceDiagram
  autonumber
  actor U as 医療者
  participant K as カルテ画面
  participant B as EHR backend
  participant C as CDS サービス

  alt 「臨床スコアで開く」
    U->>K: カードのリンクを押す
    Note over K: appContext をメモリに置き、SMARTアプリ タブへ切り替える
    K->>B: POST /smart_apps/:id/launch {…, app_context: {"score":"egfr"}}
    Note over K,B: 以降は「EHR launch」と同じ。<br/>トークン応答の appContext でアプリが該当のタブを開く
  else 「無視」で理由を選ぶ
    U->>K: 理由(対応済み / 該当しない)を選ぶ
    K->>B: POST /integrations/cds/feedback {service_id, card, outcome: overridden, override_reason}
    B->>C: POST /cds-services/clinical-scores/feedback(Bearer: CDS 共有トークン)
    C-->>B: 200(ログに outcome と理由のコードだけを残す)
  end
```

## 本番で確認すること

- SMART アプリと CDS サービスは https で配信する(EHR は本番で http の起動 URL・CDS の URL を受け付けない)。
- SMART アプリは `Content-Security-Policy: frame-ancestors <EHR のオリジン>` を応答ヘッダーで出し、`X-Frame-Options` は出さない。
- CDS サービスには `CDS_AUTH_TOKEN` を設定し、EHR の管理画面「CDS サービス」の認証トークンに同じ値を入れる。
- CDS サービスの `SMART_APP_LAUNCH_URL` を、EHR に登録した SMART アプリの起動 URL(クエリを除く)と一致させる。
- CDS サービスは患者データ(prefetch)を受け取るので、置き場所(国内のサーバーが要るか)を施設の方針で確認する。
