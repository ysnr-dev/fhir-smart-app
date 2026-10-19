import type Client from "fhirclient/Client";
export interface SmartSession {
    client: Client;
    serverUrl: string;
    patientId: string;
    encounterId: string | null;
    /** id_token の fhirUser(`Practitioner/{id}` など)。 */
    fhirUser: string | null;
    grantedScope: string;
    needPatientBanner: boolean;
    appContext: string | null;
}
/**
 * 認可コードは 1 回しか交換できないので、`ready()` はページ内で 1 回だけ呼ぶ
 * (React の StrictMode は effect を 2 回走らせる)。
 */
export declare function readySession(): Promise<SmartSession>;
/** 認可が済んでいない・launch が消費済みなど、起動からやり直すしかない失敗。 */
export declare function isLaunchError(error: unknown): boolean;
//# sourceMappingURL=session.d.ts.map