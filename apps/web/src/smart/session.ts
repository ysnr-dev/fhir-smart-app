/**
 * 認可後のセッション。fhirclient の `ready()` が返す client と、トークン応答から読んだ文脈。
 */
import FHIR from "fhirclient/browser";
import type Client from "fhirclient/Client";

/** トークン応答のうちこのアプリが使う項目(SMART App Launch 2.2 + CDS Hooks の appContext)。 */
interface TokenContext {
  scope?: string;
  patient?: string;
  encounter?: string;
  need_patient_banner?: boolean;
  appContext?: string;
}

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

let sessionPromise: Promise<SmartSession> | null = null;

/**
 * 認可コードは 1 回しか交換できないので、`ready()` はページ内で 1 回だけ呼ぶ
 * (React の StrictMode は effect を 2 回走らせる)。
 */
export function readySession(): Promise<SmartSession> {
  sessionPromise ??= establishSession();
  return sessionPromise;
}

async function establishSession(): Promise<SmartSession> {
  const client = await FHIR.oauth2.ready();
  const token = (client.state.tokenResponse ?? {}) as TokenContext;
  const patientId = client.getPatientId();
  if (!patientId) throw new Error("患者の文脈がありません(launch/patient が付与されていません)");
  return {
    client,
    serverUrl: client.state.serverUrl,
    patientId,
    encounterId: client.getEncounterId() ?? token.encounter ?? null,
    fhirUser: client.getFhirUser(),
    grantedScope: token.scope ?? "",
    needPatientBanner: token.need_patient_banner !== false,
    appContext: token.appContext ?? null,
  };
}

/** 認可が済んでいない・launch が消費済みなど、起動からやり直すしかない失敗。 */
export function isLaunchError(error: unknown): boolean {
  const message = String(error);
  return /No 'state' parameter|state|invalid_request|invalid_grant|sessionStorage/i.test(message);
}
