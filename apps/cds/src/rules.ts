/**
 * patient-view で出すカードの判定。計算は packages/scores の計算式をそのまま使い、
 * ここでは「どの入力をいつまでの値なら使うか」と「どの値でカードを出すか」だけを決める。
 *
 * 入力が古い・足りないときはカードを出さない(判断支援が黙って外れる方に倒す)。
 */
import {
  SCORE_SYSTEM,
  cha2ds2vasc,
  effectiveOf,
  egfr,
  icd10,
  matchesCode,
  qsofa,
  resolveInputs,
  type PatientData,
  type ResolvedInputs,
  type ScoreDefinition,
  type ScoreResult,
} from "@fhir-smart-app/scores";
import { randomUUID } from "node:crypto";
import type { Card } from "./hooks";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface RuleContext {
  now: Date;
  smartAppLaunchUrl: string;
}

interface Rule {
  score: ScoreDefinition;
  /** 入力ごとの値の有効期間(ミリ秒)。ここに無い数値入力は期間を問わない。 */
  maxAge?: Record<string, number>;
  /** 計算の前提(心房細動がある、など)。満たさなければ計算しない。 */
  applies?: (data: PatientData) => boolean;
  card: (result: ScoreResult, inputs: ResolvedInputs) => Pick<Card, "summary" | "indicator"> | null;
}

/** 心房細動・心房粗動(ICD-10 I48)。 */
const ATRIAL_FIBRILLATION = icd10("I48");

function hasActiveCondition(data: PatientData, matchers: ReturnType<typeof icd10>): boolean {
  return data.conditions.some((condition) => {
    const status = condition.clinicalStatus?.coding?.[0]?.code;
    const active = !status || ["active", "recurrence", "relapse"].includes(status);
    return active && matchesCode(condition.code, matchers);
  });
}

export const RULES: readonly Rule[] = [
  {
    score: qsofa,
    maxAge: { respiratoryRate: DAY, systolic: DAY, gcs: DAY },
    card: (result) =>
      result.value >= 2
        ? { summary: `qSOFA ${result.value} 点: 敗血症の評価を検討`, indicator: "warning" }
        : null,
  },
  {
    score: egfr,
    maxAge: { creatinine: 90 * DAY },
    card: (result) => {
      if (result.value >= 45) return null;
      return {
        summary: `eGFR ${result.value}(${result.interpretation}): 腎機能に応じた用量を確認`,
        indicator: result.value < 30 ? "warning" : "info",
      };
    },
  },
  {
    score: cha2ds2vasc,
    applies: (data) => hasActiveCondition(data, ATRIAL_FIBRILLATION),
    card: (result) =>
      result.interpretation === "高リスク"
        ? { summary: `心房細動: CHA₂DS₂-VASc ${result.value} 点(高リスク)。抗凝固療法の適応を確認`, indicator: "info" }
        : null,
  },
];

/** 有効期間を過ぎた入力を未入力に戻す。 */
function withinMaxAge(inputs: ResolvedInputs, maxAge: Record<string, number>, now: Date): ResolvedInputs {
  const values = { ...inputs.values };
  const sources = { ...inputs.sources };
  for (const [key, age] of Object.entries(maxAge)) {
    const source = sources[key];
    if (!source) continue;
    const effective = source.resource.resourceType === "Observation" ? Date.parse(effectiveOf(source.resource)) : NaN;
    if (Number.isNaN(effective) || now.getTime() - effective > age) {
      values[key] = null;
      delete sources[key];
    }
  }
  return { values, sources };
}

function detailOf(score: ScoreDefinition, result: ScoreResult, inputs: ResolvedInputs): string {
  const sourceLines = score.inputs.flatMap((input) => {
    const source = inputs.sources[input.key];
    if (!source) return [];
    if (input.kind !== "quantity") return [`${input.label}: ${source.label}`];
    const unit = input.unit ? ` ${input.unit}` : "";
    return [`${input.label}: ${inputs.values[input.key]}${unit}(${source.label})`];
  });
  return [
    `${score.name} ${result.value}${result.unit ? ` ${result.unit}` : " 点"}(${result.interpretation})`,
    ...sourceLines,
    "",
    "内訳",
    ...result.details.map((d) => `${d.label}: ${d.value}`),
  ].join("\n");
}

export const OVERRIDE_REASON_SYSTEM = "http://fhir-smart-app.local/CodeSystem/override-reason";

export function evaluate(data: PatientData, context: RuleContext): Card[] {
  const cards: Card[] = [];
  for (const rule of RULES) {
    if (rule.applies && !rule.applies(data)) continue;
    const resolved = resolveInputs(rule.score, { ...data, asOf: context.now });
    const inputs = rule.maxAge ? withinMaxAge(resolved, rule.maxAge, context.now) : resolved;
    if (rule.score.validate(inputs.values)) continue;
    const result = rule.score.compute(inputs.values);
    const card = rule.card(result, inputs);
    if (!card) continue;
    cards.push({
      uuid: randomUUID(),
      summary: card.summary.slice(0, 140),
      indicator: card.indicator,
      detail: detailOf(rule.score, result, inputs),
      source: {
        label: "臨床スコア",
        topic: { system: SCORE_SYSTEM, code: rule.score.id, display: rule.score.name },
      },
      links: [
        {
          label: "臨床スコアで開く",
          url: context.smartAppLaunchUrl,
          type: "smart",
          appContext: JSON.stringify({ score: rule.score.id }),
        },
      ],
      overrideReasons: [
        { system: OVERRIDE_REASON_SYSTEM, code: "addressed", display: "対応済み" },
        { system: OVERRIDE_REASON_SYSTEM, code: "not-applicable", display: "該当しない" },
      ],
    });
  }
  return cards;
}
