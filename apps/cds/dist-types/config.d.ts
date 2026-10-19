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
export declare function loadConfig(env?: NodeJS.ProcessEnv): Config;
//# sourceMappingURL=config.d.ts.map