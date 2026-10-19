/**
 * 計算式の入力に使うリソースをまとめて読む。検索の組み立ては CDS サービスの prefetch と共通。
 */
import { patientData, patientDataQueries, type PatientData } from "@fhir-smart-app/scores";
import type Client from "fhirclient/Client";

const SEARCH_COUNT = 200;

async function search<T extends fhir4.Resource>(client: Client, query: string | null): Promise<T[]> {
  if (!query) return [];
  const resources = (await client.request<T[]>(query, { pageLimit: 1, flat: true })) ?? [];
  return resources.filter((r) => r.resourceType !== "OperationOutcome");
}

export async function loadPatientData(client: Client, patientId: string): Promise<PatientData> {
  const queries = patientDataQueries(encodeURIComponent(patientId), SEARCH_COUNT);
  const [patient, coded, laboratory, conditions] = await Promise.all([
    client.request<fhir4.Patient>(queries.patient),
    search<fhir4.Observation>(client, queries.coded),
    search<fhir4.Observation>(client, queries.laboratory),
    search<fhir4.Condition>(client, queries.conditions),
  ]);
  return patientData(patient, [coded, laboratory], conditions);
}
