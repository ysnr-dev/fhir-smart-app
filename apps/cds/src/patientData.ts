/**
 * hook のリクエストから計算式の入力を集める。
 *
 * prefetch を優先し、EHR が省いた key(満たせなかったテンプレート)は fhirAuthorization があれば
 * 自分で上流を読んで補う。どちらも無ければその分は空として扱う(カードを出さない側に倒れる)。
 */
import { patientData, resourcesOf, type PatientData } from "@fhir-smart-app/scores";
import type { Config } from "./config";
import { SERVICES } from "./discovery";
import type { HookRequest } from "./hooks";

type Fetcher = (query: string) => Promise<fhir4.Resource | null>;

function fhirFetcher(request: HookRequest, config: Config): Fetcher | null {
  const auth = request.fhirAuthorization;
  const base = config.fhirBaseUrl || request.fhirServer?.replace(/\/$/, "");
  if (!auth || !base) return null;
  return async (query) => {
    const response = await fetch(`${base}/${query}`, {
      headers: { Authorization: `Bearer ${auth.access_token}`, Accept: "application/fhir+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return (await response.json()) as fhir4.Resource;
  };
}

/** prefetch のテンプレートを実際の患者 id で埋める。 */
function fill(template: string, request: HookRequest): string | null {
  let missing = false;
  const filled = template.replace(/\{\{\s*context\.(\w+)\s*\}\}/g, (_, name: string) => {
    const value = request.context[name as keyof HookRequest["context"]];
    if (!value) missing = true;
    return encodeURIComponent(value ?? "");
  });
  return missing ? null : filled;
}

export async function collectPatientData(
  serviceId: string,
  request: HookRequest,
  config: Config,
): Promise<PatientData | null> {
  const templates = SERVICES.find((service) => service.id === serviceId)?.prefetch ?? {};
  const fetcher = fhirFetcher(request, config);
  const prefetch = request.prefetch ?? {};

  const resolved: Record<string, fhir4.Resource | null> = {};
  await Promise.all(
    Object.entries(templates).map(async ([key, template]) => {
      const given = prefetch[key];
      if (given) {
        resolved[key] = given;
        return;
      }
      const query = fill(template, request);
      resolved[key] = fetcher && query ? await fetcher(query).catch(() => null) : null;
    }),
  );

  const patient = resolved.patient as fhir4.Patient | null | undefined;
  if (patient?.resourceType !== "Patient") return null;
  return patientData(
    patient,
    [
      resourcesOf<fhir4.Observation>(resolved.coded as fhir4.Bundle | undefined, "Observation"),
      resourcesOf<fhir4.Observation>(resolved.laboratory as fhir4.Bundle | undefined, "Observation"),
    ],
    resourcesOf<fhir4.Condition>(resolved.conditions as fhir4.Bundle | undefined, "Condition"),
  );
}
