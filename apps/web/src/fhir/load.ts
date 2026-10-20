/**
 * 計算式の入力と、書き戻した計算結果(履歴)をまとめて読む。検索の組み立ては CDS サービスの prefetch と共通。
 */
import { patientData, patientDataQueries, scoreHistoryQuery, type PatientData } from "@fhir-smart-app/scores";
import type Client from "fhirclient/Client";

const SEARCH_COUNT = 200;

async function search<T extends fhir4.Resource>(client: Client, query: string | null): Promise<T[]> {
  if (!query) return [];
  const resources = (await client.request<T[]>(query, { pageLimit: 1, flat: true })) ?? [];
  return resources.filter((r) => r.resourceType !== "OperationOutcome");
}

export interface LoadedPatient {
  data: PatientData;
  /** 書き戻した計算結果(全計算式、新しい順)。 */
  history: fhir4.Observation[];
}

export async function loadPatient(client: Client, patientId: string): Promise<LoadedPatient> {
  const encoded = encodeURIComponent(patientId);
  const queries = patientDataQueries(encoded, SEARCH_COUNT);
  const [patient, coded, laboratory, conditions, history] = await Promise.all([
    client.request<fhir4.Patient>(queries.patient),
    search<fhir4.Observation>(client, queries.coded),
    search<fhir4.Observation>(client, queries.laboratory),
    search<fhir4.Condition>(client, queries.conditions),
    search<fhir4.Observation>(client, scoreHistoryQuery(encoded, SEARCH_COUNT)),
  ]);
  return { data: patientData(patient, [coded, laboratory], conditions), history };
}
