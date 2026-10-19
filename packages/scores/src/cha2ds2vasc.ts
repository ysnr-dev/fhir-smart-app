import { SCORE_SYSTEM, icd10 } from "./codes";
import type { ScoreDefinition } from "./types";

/**
 * CHA₂DS₂-VASc(心房細動の脳卒中リスク)。病名から各項目の初期値を立て、年齢・性別は患者属性から入れる。
 */
export const cha2ds2vasc: ScoreDefinition = {
  id: "cha2ds2-vasc",
  name: "CHA₂DS₂-VASc",
  reference: "Lip GY, et al. Chest 2010;137:263-72",
  inputs: [
    { kind: "age", key: "age", label: "年齢" },
    { kind: "sex", key: "sex", label: "性別" },
    { kind: "boolean", key: "chf", label: "心不全", conditions: icd10("I50", "I110", "I130", "I132", "I42", "I43") },
    { kind: "boolean", key: "hypertension", label: "高血圧", conditions: icd10("I10", "I11", "I12", "I13", "I15") },
    { kind: "boolean", key: "diabetes", label: "糖尿病", conditions: icd10("E10", "E11", "E12", "E13", "E14") },
    {
      kind: "boolean",
      key: "stroke",
      label: "脳卒中・TIA・血栓塞栓症",
      conditions: icd10("I60", "I61", "I62", "I63", "I64", "G45", "I26", "I74"),
    },
    {
      kind: "boolean",
      key: "vascular",
      label: "血管疾患(心筋梗塞・末梢動脈疾患・大動脈プラーク)",
      conditions: icd10("I21", "I22", "I252", "I70", "I71", "I73"),
    },
  ],
  validate(values) {
    if (typeof values.age !== "number") return "年齢が分かりません";
    if (values.sex !== "male" && values.sex !== "female") return "性別が男女どちらか分かりません";
    return null;
  },
  compute(values) {
    const age = values.age as number;
    const items: { label: string; points: number }[] = [
      { label: "心不全", points: values.chf ? 1 : 0 },
      { label: "高血圧", points: values.hypertension ? 1 : 0 },
      { label: "年齢 75 歳以上", points: age >= 75 ? 2 : 0 },
      { label: "糖尿病", points: values.diabetes ? 1 : 0 },
      { label: "脳卒中・TIA・血栓塞栓症", points: values.stroke ? 2 : 0 },
      { label: "血管疾患", points: values.vascular ? 1 : 0 },
      { label: "年齢 65〜74 歳", points: age >= 65 && age < 75 ? 1 : 0 },
      { label: "女性", points: values.sex === "female" ? 1 : 0 },
    ];
    const value = items.reduce((sum, item) => sum + item.points, 0);
    const threshold = values.sex === "female" ? 3 : 2;
    const interpretation = value >= threshold ? "高リスク" : value >= 1 && (values.sex === "male" || value >= 2) ? "中リスク" : "低リスク";
    return {
      value,
      interpretation,
      details: items.map((item) => ({ label: item.label, value: `${item.points}` })),
    };
  },
  observation: { system: SCORE_SYSTEM, code: "cha2ds2-vasc", display: "CHA2DS2-VASc スコア" },
};
