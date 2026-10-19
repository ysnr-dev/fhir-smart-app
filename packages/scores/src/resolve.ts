/**
 * FHIR リソースから計算式の入力の初期値を取り出す。
 *
 * Observation は新しい順に並んでいる前提で、最初に一致したものを採る。
 * どのリソースから取ったかを `sources` に残し、画面で出典を示せるようにする。
 */
import type { CodeMatcher, InputValues, ScoreDefinition, ScoreInput, Sex } from "./types";

export interface PatientData {
  patient: fhir4.Patient;
  observations: readonly fhir4.Observation[];
  conditions: readonly fhir4.Condition[];
  /** 年齢の基準日(既定は今日)。 */
  asOf?: Date;
}

export interface InputSource {
  resource: fhir4.Observation | fhir4.Condition;
  /** 画面に出す短い説明(日付・元の値と単位など)。 */
  label: string;
}

export interface ResolvedInputs {
  values: InputValues;
  sources: Record<string, InputSource>;
}

function matchesOne(coding: fhir4.Coding, matcher: CodeMatcher): boolean {
  const systems = typeof matcher.system === "string" ? [matcher.system] : matcher.system;
  if (!coding.system || !systems.includes(coding.system)) return false;
  const code = coding.code ?? "";
  if (matcher.code !== undefined) return code === matcher.code;
  if (matcher.prefix !== undefined) return code.startsWith(matcher.prefix);
  return false;
}

export function matchesCode(concept: fhir4.CodeableConcept | undefined, matchers: readonly CodeMatcher[]): boolean {
  return (concept?.coding ?? []).some((coding) => matchers.some((matcher) => matchesOne(coding, matcher)));
}

export function effectiveOf(observation: fhir4.Observation): string {
  return observation.effectiveDateTime ?? observation.effectivePeriod?.start ?? observation.issued ?? "";
}

/** 新しい順に並べ替える(同じ日時なら元の順)。 */
export function sortByEffectiveDesc(observations: readonly fhir4.Observation[]): fhir4.Observation[] {
  return [...observations].sort((a, b) => effectiveOf(b).localeCompare(effectiveOf(a)));
}

export function ageAt(birthDate: string | undefined, asOf: Date): number | null {
  if (!birthDate) return null;
  const [y, m = 1, d = 1] = birthDate.split("-").map(Number);
  if (!y) return null;
  let age = asOf.getFullYear() - y;
  const beforeBirthday = asOf.getMonth() + 1 < m || (asOf.getMonth() + 1 === m && asOf.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

function sexOf(patient: fhir4.Patient): Sex {
  return patient.gender ?? "unknown";
}

function quantityOf(
  observation: fhir4.Observation,
  input: Extract<ScoreInput, { kind: "quantity" }>,
): { value: number; unit: string | undefined } | null {
  const holder = input.component
    ? observation.component?.find((component) => matchesCode(component.code, input.component!))
    : observation;
  const quantity = holder?.valueQuantity;
  if (quantity?.value === undefined) return null;
  const unit = quantity.unit ?? quantity.code;
  const value = input.convert ? input.convert(quantity.value, unit) : quantity.value;
  return value === null ? null : { value, unit };
}

/** 活動中の病名だけを初期値に使う。clinicalStatus が無いものは活動中とみなす。 */
function isActiveCondition(condition: fhir4.Condition): boolean {
  const status = condition.clinicalStatus?.coding?.[0]?.code;
  return !status || ["active", "recurrence", "relapse"].includes(status);
}

export function resolveInputs(definition: ScoreDefinition, data: PatientData): ResolvedInputs {
  const asOf = data.asOf ?? new Date();
  const observations = sortByEffectiveDesc(data.observations);
  const values: InputValues = {};
  const sources: Record<string, InputSource> = {};

  for (const input of definition.inputs) {
    switch (input.kind) {
      case "age":
        values[input.key] = ageAt(data.patient.birthDate, asOf);
        break;
      case "sex":
        values[input.key] = sexOf(data.patient);
        break;
      case "quantity": {
        let found: { value: number; unit: string | undefined; observation: fhir4.Observation } | null = null;
        for (const observation of observations) {
          if (!matchesCode(observation.code, input.matchers)) continue;
          const quantity = quantityOf(observation, input);
          if (quantity) {
            found = { ...quantity, observation };
            break;
          }
        }
        values[input.key] = found?.value ?? null;
        if (found) {
          const raw = found.observation.valueQuantity ?? null;
          const rawText = raw && raw.value !== found.value ? `(元の値 ${raw.value} ${raw.unit ?? ""})` : "";
          sources[input.key] = {
            resource: found.observation,
            label: `${effectiveOf(found.observation).slice(0, 10)} ${rawText}`.trim(),
          };
        }
        break;
      }
      case "boolean": {
        const condition = input.conditions
          ? data.conditions.find((c) => isActiveCondition(c) && matchesCode(c.code, input.conditions!))
          : undefined;
        values[input.key] = condition !== undefined;
        if (condition) {
          sources[input.key] = {
            resource: condition,
            label: condition.code?.text ?? condition.code?.coding?.[0]?.display ?? "病名",
          };
        }
        break;
      }
    }
  }
  return { values, sources };
}
