import { JLAC10, JLAC11, LOINC } from "./codes";
import type { ScoreDefinition } from "./types";

/** JLAC の分析物コード(先頭 5 桁)。血清クレアチニン。 */
const CREATININE_ANALYTE = "C3002";

/** µmol/L で返す検査室向けの換算。mg/dL ならそのまま。 */
function toMgPerDl(value: number, unit: string | undefined): number | null {
  const u = (unit ?? "").toLowerCase();
  if (u === "" || u === "mg/dl") return value;
  if (u === "umol/l" || u === "µmol/l" || u === "μmol/l") return value / 88.4;
  return null;
}

/** CKD の GFR 区分(日本腎臓学会 CKD 診療ガイド)。 */
function stageOf(egfr: number): string {
  if (egfr >= 90) return "G1";
  if (egfr >= 60) return "G2";
  if (egfr >= 45) return "G3a";
  if (egfr >= 30) return "G3b";
  if (egfr >= 15) return "G4";
  return "G5";
}

/**
 * 日本人向け eGFR 推算式(日本腎臓学会 2008)。18 歳以上の血清クレアチニン(mg/dL)から算出する。
 */
export const egfr: ScoreDefinition = {
  id: "egfr",
  name: "eGFR(日本人 GFR 推算式)",
  reference: "日本腎臓学会 2008: 194 × Cr^-1.094 × 年齢^-0.287(女性 × 0.739)",
  inputs: [
    { kind: "age", key: "age", label: "年齢" },
    { kind: "sex", key: "sex", label: "性別" },
    {
      kind: "quantity",
      key: "creatinine",
      label: "血清クレアチニン",
      unit: "mg/dL",
      matchers: [
        { system: LOINC, code: "2160-0" },
        { system: JLAC11, prefix: CREATININE_ANALYTE },
        { system: JLAC10, prefix: "3C015" },
      ],
      convert: toMgPerDl,
    },
  ],
  validate(values) {
    const age = values.age;
    if (typeof age !== "number") return "年齢が分かりません";
    if (age < 18) return "18 歳未満には適用できません";
    if (values.sex !== "male" && values.sex !== "female") return "性別が男女どちらか分かりません";
    const cr = values.creatinine;
    if (typeof cr !== "number" || cr <= 0) return "血清クレアチニンがありません";
    return null;
  },
  compute(values) {
    const age = values.age as number;
    const cr = values.creatinine as number;
    const base = 194 * cr ** -1.094 * age ** -0.287;
    const value = Math.round((values.sex === "female" ? base * 0.739 : base) * 10) / 10;
    return {
      value,
      unit: "mL/min/{1.73_m2}",
      interpretation: stageOf(value),
      details: [
        { label: "血清クレアチニン", value: `${cr} mg/dL` },
        { label: "年齢", value: `${age}` },
        { label: "性別", value: values.sex === "female" ? "女性" : "男性" },
      ],
    };
  },
  observation: {
    system: LOINC,
    code: "69405-9",
    display: "Glomerular filtration rate/1.73 sq M.predicted",
  },
};
