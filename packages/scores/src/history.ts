/**
 * 書き戻した計算結果(Observation)の読み返し。
 *
 * 書き戻しは `category=survey` と計算式ごとのコード(`ScoreDefinition.observation`)で行うので、
 * 同じ組で検索すれば計算式ごとの履歴になる。
 */
import { OBSERVATION_CATEGORY_SYSTEM } from "./codes";
import { SCORES } from "./registry";
import { effectiveOf, sortByEffectiveDesc } from "./resolve";
import type { ScoreDefinition } from "./types";

export interface ScoreHistoryEntry {
  observation: fhir4.Observation;
  effective: string;
  value: number | null;
  unit?: string;
  interpretation: string;
}

/** 全計算式の書き戻し結果を新しい順に読む検索。`patientId` はエンコード済みの値。 */
export function scoreHistoryQuery(patientId: string, count: number): string {
  const codes = SCORES.map((score) => `${score.observation.system}|${score.observation.code}`);
  const category = `${OBSERVATION_CATEGORY_SYSTEM}|survey`;
  return (
    `Observation?patient=${patientId}&category=${encodeURIComponent(category)}` +
    `&code=${encodeURIComponent(codes.join(","))}&_sort=-date&_count=${count}`
  );
}

function isScoreObservation(observation: fhir4.Observation, score: ScoreDefinition): boolean {
  if (observation.status === "entered-in-error") return false;
  return (observation.code?.coding ?? []).some(
    (coding) => coding.system === score.observation.system && coding.code === score.observation.code,
  );
}

/** 解釈は `interpretation[].text`、無ければ `note` の 1 行目(書き戻しの書式)から読む。 */
function interpretationOf(observation: fhir4.Observation): string {
  const text = observation.interpretation?.find((concept) => concept.text)?.text;
  if (text) return text;
  return observation.note?.[0]?.text?.split("\n")[0] ?? "";
}

/** 1 つの計算式の履歴を新しい順に。 */
export function scoreHistory(observations: readonly fhir4.Observation[], score: ScoreDefinition): ScoreHistoryEntry[] {
  return sortByEffectiveDesc(observations.filter((observation) => isScoreObservation(observation, score))).map(
    (observation) => ({
      observation,
      effective: effectiveOf(observation),
      value: observation.valueQuantity?.value ?? observation.valueInteger ?? null,
      unit: observation.valueQuantity?.unit,
      interpretation: interpretationOf(observation),
    }),
  );
}
