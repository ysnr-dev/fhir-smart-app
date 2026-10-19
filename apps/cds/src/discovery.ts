import { patientDataQueries } from "@fhir-smart-app/scores";
import type { DiscoveryService } from "./hooks";

/** prefetch の件数。EHR は `_count` の無い検索に 100 を補うので、それに揃える。 */
const PREFETCH_COUNT = 100;

/** 計算式の入力を読む prefetch。key は patientData.ts が読む名前。 */
function scorePrefetch(): Record<string, string> {
  const queries = patientDataQueries("{{context.patientId}}", PREFETCH_COUNT);
  return {
    patient: queries.patient,
    conditions: queries.conditions,
    ...(queries.coded ? { coded: queries.coded } : {}),
    ...(queries.laboratory ? { laboratory: queries.laboratory } : {}),
  };
}

export const PATIENT_VIEW_SERVICE_ID = "clinical-scores";

export const SERVICES: readonly DiscoveryService[] = [
  {
    hook: "patient-view",
    id: PATIENT_VIEW_SERVICE_ID,
    title: "臨床スコア",
    description: "直近の検査値・バイタル・病名から qSOFA・eGFR・CHA₂DS₂-VASc を計算し、基準を超えたものをカードで知らせる",
    prefetch: scorePrefetch(),
  },
];
