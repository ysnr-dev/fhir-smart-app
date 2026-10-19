/**
 * SMART App Launch の EHR launch 入口。EHR が `?iss=&launch=` を付けてここを開く。
 *
 * client_id は起動 URL のクエリ(`?client_id=`)で受け、EHR の登録画面で配布先ごとに変えられるようにする。
 * スコープは登録済みの範囲を超えると認可サーバーが invalid_scope を返すので、
 * 既定の読み取りだけの組を使い、書き戻しが要る配布では `?scope=` で差し替える。
 */
import FHIR from "fhirclient/browser";
import { DEFAULT_SCOPE } from "./smart/scope";

const params = new URLSearchParams(location.search);
const clientId = params.get("client_id");
const main = document.querySelector("main")!;

if (!clientId) {
  main.innerHTML = '<p class="error">起動 URL に ?client_id= が必要です。</p>';
} else if (!params.get("iss") || !params.get("launch")) {
  main.innerHTML = '<p class="error">カルテの「アプリ」タブから起動してください(iss と launch が必要です)。</p>';
} else {
  FHIR.oauth2
    .authorize({
      clientId,
      scope: params.get("scope") ?? DEFAULT_SCOPE,
      redirectUri: "/",
      pkceMode: "required",
    })
    .catch((error: unknown) => {
      main.innerHTML = `<p class="error">${String(error)}</p>`;
    });
}
