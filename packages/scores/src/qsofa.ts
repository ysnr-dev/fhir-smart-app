import { LOINC, SCORE_SYSTEM } from "./codes";
import type { ScoreDefinition } from "./types";

/**
 * qSOFA(敗血症の簡易スクリーニング)。呼吸数・収縮期血圧はバイタルから、意識変容は GCS があればそこから入れる。
 */
export const qsofa: ScoreDefinition = {
  id: "qsofa",
  name: "qSOFA",
  reference: "Singer M, et al. JAMA 2016;315:801-10",
  inputs: [
    {
      kind: "quantity",
      key: "respiratoryRate",
      label: "呼吸数",
      unit: "/min",
      matchers: [{ system: LOINC, code: "9279-1" }],
    },
    {
      kind: "quantity",
      key: "systolic",
      label: "収縮期血圧",
      unit: "mmHg",
      matchers: [
        { system: LOINC, code: "8480-6" },
        { system: LOINC, code: "85354-9" },
      ],
      component: [{ system: LOINC, code: "8480-6" }],
    },
    {
      kind: "quantity",
      key: "gcs",
      label: "GCS 合計",
      unit: "",
      matchers: [{ system: LOINC, code: "9269-2" }],
    },
    { kind: "boolean", key: "alteredMentation", label: "意識変容(GCS < 15)" },
  ],
  validate(values) {
    if (typeof values.respiratoryRate !== "number") return "呼吸数がありません";
    if (typeof values.systolic !== "number") return "収縮期血圧がありません";
    return null;
  },
  compute(values) {
    const rr = values.respiratoryRate as number;
    const sbp = values.systolic as number;
    const altered = values.alteredMentation === true || (typeof values.gcs === "number" && values.gcs < 15);
    const items = [
      { label: "呼吸数 ≥ 22", points: rr >= 22 ? 1 : 0 },
      { label: "収縮期血圧 ≤ 100", points: sbp <= 100 ? 1 : 0 },
      { label: "意識変容", points: altered ? 1 : 0 },
    ];
    const value = items.reduce((sum, item) => sum + item.points, 0);
    return {
      value,
      interpretation: value >= 2 ? "高リスク(2 点以上)" : "低リスク",
      details: items.map((item) => ({ label: item.label, value: `${item.points}` })),
    };
  },
  observation: { system: SCORE_SYSTEM, code: "qsofa", display: "qSOFA スコア" },
};
