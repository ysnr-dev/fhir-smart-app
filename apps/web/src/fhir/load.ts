/**
 * 計算式の入力に使うリソースをまとめて読む。
 *
 * 完全一致のコード(LOINC など)は `code=` のカンマ OR で、前方一致のコード(JLAC の分析物)は
 * 検体検査のカテゴリで読んで手元で照合する。どちらも新しい順に上限件数まで。
 */
import { SCORES, type CodeMatcher, type PatientData } from "@fhir-smart-app/scores";
import type Client from "fhirclient/Client";

const OBSERVATION_LIMIT = 200;
const CONDITION_LIMIT = 200;

function exactCodes(matchers: readonly CodeMatcher[]): string[] {
  return matchers.flatMap((matcher) => {
    if (matcher.code === undefined) return [];
    const systems = typeof matcher.system === "string" ? [matcher.system] : matcher.system;
    return systems.map((system) => `${system}|${matcher.code}`);
  });
}

function hasPrefixMatcher(matchers: readonly CodeMatcher[]): boolean {
  return matchers.some((matcher) => matcher.prefix !== undefined);
}

function collectMatchers(): { codes: string[]; needsLaboratory: boolean } {
  const codes = new Set<string>();
  let needsLaboratory = false;
  for (const score of SCORES) {
    for (const input of score.inputs) {
      if (input.kind !== "quantity") continue;
      exactCodes(input.matchers).forEach((code) => codes.add(code));
      if (hasPrefixMatcher(input.matchers)) needsLaboratory = true;
    }
  }
  return { codes: [...codes], needsLaboratory };
}

async function search<T extends fhir4.Resource>(client: Client, query: string): Promise<T[]> {
  const resources = (await client.request<T[]>(query, { pageLimit: 1, flat: true })) ?? [];
  return resources.filter((r) => r.resourceType !== "OperationOutcome");
}

export async function loadPatientData(client: Client, patientId: string): Promise<PatientData> {
  const { codes, needsLaboratory } = collectMatchers();
  const patientQuery = `patient=${encodeURIComponent(patientId)}`;
  const [patient, coded, laboratory, conditions] = await Promise.all([
    client.request<fhir4.Patient>(`Patient/${encodeURIComponent(patientId)}`),
    codes.length
      ? search<fhir4.Observation>(
          client,
          `Observation?${patientQuery}&code=${encodeURIComponent(codes.join(","))}&_sort=-date&_count=${OBSERVATION_LIMIT}`,
        )
      : Promise.resolve([]),
    needsLaboratory
      ? search<fhir4.Observation>(
          client,
          `Observation?${patientQuery}&category=laboratory&_sort=-date&_count=${OBSERVATION_LIMIT}`,
        )
      : Promise.resolve([]),
    search<fhir4.Condition>(client, `Condition?${patientQuery}&_count=${CONDITION_LIMIT}`),
  ]);
  const seen = new Set<string>();
  const observations = [...coded, ...laboratory].filter((o) => {
    if (!o.id || seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
  return { patient, observations, conditions };
}
