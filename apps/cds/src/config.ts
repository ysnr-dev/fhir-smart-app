/**
 * 環境変数から読む設定。
 */
export interface Config {
  port: number;
  /** カードの smart リンクの URL。EHR に登録した SMART アプリの起動 URL(クエリを除く)と一致させる。 */
  smartAppLaunchUrl: string;
  /** EHR が Authorization: Bearer で送る共有トークン。空なら検査しない(開発用)。 */
  authToken: string;
  /** fhirAuthorization で上流を読むときの接続先。空ならリクエストの fhirServer を使う。 */
  fhirBaseUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 5181),
    smartAppLaunchUrl: env.SMART_APP_LAUNCH_URL ?? "http://localhost:5180/launch.html",
    authToken: env.CDS_AUTH_TOKEN ?? "",
    fhirBaseUrl: (env.FHIR_BASE_URL ?? "").replace(/\/$/, ""),
  };
}
