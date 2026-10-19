/**
 * 計算式の入力を読む FHIR 検索。SMART アプリ(実際の患者 id)と CDS サービスの prefetch テンプレート
 * (`{{context.patientId}}`)の両方がここから組み立てる。
 *
 * 完全一致のコード(LOINC など)は `code=` のカンマ OR、前方一致のコード(JLAC の分析物)は
 * 検体検査のカテゴリで読んで手元で照合する。どちらも新しい順に `count` 件まで。
 */
import { SCORES } from "./registry";
import type { PatientData } from "./resolve";
import type { CodeMatcher } from "./types";

export interface PatientDataQueries {
  patient: string;
  /** 完全一致のコードで読む Observation。対象のコードが無ければ null。 */
  coded: string | null;
  /** 前方一致の照合に使う検体検査。前方一致の入力が無ければ null。 */
  laboratory: string | null;
  conditions: string;
}

function exactCodes(matchers: readonly CodeMatcher[]): string[] {
  return matchers.flatMap((matcher) => {
    if (matcher.code === undefined) return [];
    const systems = typeof matcher.system === "string" ? [matcher.system] : matcher.system;
    return systems.map((system) => `${system}|${matcher.code}`);
  });
}

function collectMatchers(): { codes: string[]; needsLaboratory: boolean } {
  const codes = new Set<string>();
  let needsLaboratory = false;
  for (const score of SCORES) {
    for (const input of score.inputs) {
      if (input.kind !== "quantity") continue;
      exactCodes(input.matchers).forEach((code) => codes.add(code));
      if (input.matchers.some((matcher) => matcher.prefix !== undefined)) needsLaboratory = true;
    }
  }
  return { codes: [...codes], needsLaboratory };
}

/**
 * `patientId` はクエリにそのまま埋める(呼び出し側でエンコード済みの値か、prefetch のテンプレート変数)。
 */
export function patientDataQueries(patientId: string, count: number): PatientDataQueries {
  const { codes, needsLaboratory } = collectMatchers();
  const byPatient = `patient=${patientId}`;
  return {
    patient: `Patient/${patientId}`,
    coded: codes.length
      ? `Observation?${byPatient}&code=${encodeURIComponent(codes.join(","))}&_sort=-date&_count=${count}`
      : null,
    laboratory: needsLaboratory ? `Observation?${byPatient}&category=laboratory&_sort=-date&_count=${count}` : null,
    conditions: `Condition?${byPatient}&_count=${count}`,
  };
}

function isResource<T extends fhir4.Resource>(resource: fhir4.Resource | undefined, type: T["resourceType"]): resource is T {
  return resource?.resourceType === type;
}

/** searchset Bundle から指定の型だけを取り出す(OperationOutcome や _include 行を除く)。 */
export function resourcesOf<T extends fhir4.Resource>(bundle: fhir4.Bundle | undefined, type: T["resourceType"]): T[] {
  return (bundle?.entry ?? []).map((entry) => entry.resource).filter((r): r is T => isResource<T>(r, type));
}

/** 2 つの検索結果の Observation を id で重複を除いてまとめる。 */
export function mergeObservations(...lists: readonly (readonly fhir4.Observation[])[]): fhir4.Observation[] {
  const seen = new Set<string>();
  return lists.flat().filter((observation) => {
    if (!observation.id) return true;
    if (seen.has(observation.id)) return false;
    seen.add(observation.id);
    return true;
  });
}

export function patientData(
  patient: fhir4.Patient,
  observations: readonly (readonly fhir4.Observation[])[],
  conditions: readonly fhir4.Condition[],
): PatientData {
  return { patient, observations: mergeObservations(...observations), conditions };
}
