/**
 * 算出結果を Observation として書き戻す。
 */
import {
  OBSERVATION_CATEGORY_SYSTEM,
  type InputSource,
  type ScoreDefinition,
  type ScoreResult,
} from "@fhir-smart-app/scores";
import type Client from "fhirclient/Client";
import { nowFhirDateTime } from "../dates";
import type { SmartSession } from "../smart/session";

export function buildObservation(
  score: ScoreDefinition,
  result: ScoreResult,
  session: Pick<SmartSession, "patientId" | "encounterId" | "fhirUser">,
  sources: Record<string, InputSource>,
): fhir4.Observation {
  const derivedFrom = Object.values(sources)
    .map((source) => source.resource)
    .filter((resource): resource is fhir4.Observation => resource.resourceType === "Observation" && !!resource.id)
    .map((resource) => ({ reference: `Observation/${resource.id}` }));
  const noteLines = [result.interpretation, ...result.details.map((d) => `${d.label}: ${d.value}`)];
  return {
    resourceType: "Observation",
    status: "final",
    category: [{ coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: "survey", display: "Survey" }] }],
    code: { coding: [score.observation], text: score.name },
    subject: { reference: `Patient/${session.patientId}` },
    ...(session.encounterId ? { encounter: { reference: `Encounter/${session.encounterId}` } } : {}),
    effectiveDateTime: nowFhirDateTime(),
    ...(session.fhirUser ? { performer: [{ reference: session.fhirUser }] } : {}),
    ...(result.unit
      ? { valueQuantity: { value: result.value, unit: result.unit, system: "http://unitsofmeasure.org", code: result.unit } }
      : { valueInteger: result.value }),
    interpretation: [{ text: result.interpretation }],
    note: [{ text: noteLines.join("\n") }],
    ...(derivedFrom.length ? { derivedFrom } : {}),
  };
}

export async function createObservation(client: Client, observation: fhir4.Observation): Promise<fhir4.Observation> {
  return client.create<fhir4.Observation>(observation, {
    headers: { "Content-Type": "application/fhir+json", Accept: "application/fhir+json" },
  });
}
