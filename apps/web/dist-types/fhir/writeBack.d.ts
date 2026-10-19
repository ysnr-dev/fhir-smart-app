/**
 * 算出結果を Observation として書き戻す。
 */
import { type InputSource, type ScoreDefinition, type ScoreResult } from "@fhir-smart-app/scores";
import type Client from "fhirclient/Client";
import type { SmartSession } from "../smart/session";
/** オフセット付きの現在時刻(`2026-10-19T10:00:00+09:00`)。 */
export declare function nowFhirDateTime(now?: Date): string;
export declare function buildObservation(score: ScoreDefinition, result: ScoreResult, session: Pick<SmartSession, "patientId" | "encounterId" | "fhirUser">, sources: Record<string, InputSource>): fhir4.Observation;
export declare function createObservation(client: Client, observation: fhir4.Observation): Promise<fhir4.Observation>;
//# sourceMappingURL=writeBack.d.ts.map