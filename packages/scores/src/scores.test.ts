import { describe, expect, it } from "vitest";
import { cha2ds2vasc } from "./cha2ds2vasc";
import { ICD10_SYSTEMS, JLAC11, LOINC } from "./codes";
import { egfr } from "./egfr";
import { scoreHistory, scoreHistoryQuery } from "./history";
import { qsofa } from "./qsofa";
import { ageAt, resolveInputs } from "./resolve";

const patient: fhir4.Patient = { resourceType: "Patient", id: "p1", birthDate: "1950-06-15", gender: "female" };
const asOf = new Date("2026-10-19T00:00:00+09:00");

function observation(
  code: fhir4.Coding,
  value: number,
  unit: string,
  effectiveDateTime: string,
  extra: Partial<fhir4.Observation> = {},
): fhir4.Observation {
  return {
    resourceType: "Observation",
    status: "final",
    code: { coding: [code] },
    valueQuantity: { value, unit },
    effectiveDateTime,
    ...extra,
  };
}

function condition(code: string, status = "active"): fhir4.Condition {
  return {
    resourceType: "Condition",
    subject: { reference: "Patient/p1" },
    clinicalStatus: { coding: [{ code }].map(() => ({ code: status })) },
    code: { coding: [{ system: ICD10_SYSTEMS[0], code }] },
  };
}

describe("ageAt", () => {
  it("誕生日前は 1 歳少ない", () => {
    expect(ageAt("1950-06-15", asOf)).toBe(76);
    expect(ageAt("1950-12-31", asOf)).toBe(75);
    expect(ageAt(undefined, asOf)).toBeNull();
  });
});

describe("eGFR", () => {
  it("JLAC11 の前方一致で最新のクレアチニンを採り、女性係数を掛ける", () => {
    const observations = [
      observation({ system: JLAC11, code: "C3002000025003085" }, 1.12, "mg/dL", "2026-09-01"),
      observation({ system: JLAC11, code: "C3002000025003085" }, 0.8, "mg/dL", "2026-10-01"),
    ];
    const { values, sources } = resolveInputs(egfr, { patient, observations, conditions: [], asOf });
    expect(values.creatinine).toBe(0.8);
    expect(sources.creatinine?.label).toBe("2026-10-01");
    expect(egfr.validate(values)).toBeNull();
    const result = egfr.compute(values);
    expect(result.value).toBe(Math.round(194 * 0.8 ** -1.094 * 76 ** -0.287 * 0.739 * 10) / 10);
    expect(result.interpretation).toBe("G3a");
  });

  it("µmol/L は mg/dL に換算する", () => {
    const observations = [observation({ system: LOINC, code: "2160-0" }, 88.4, "umol/L", "2026-10-01")];
    const { values, sources } = resolveInputs(egfr, { patient, observations, conditions: [], asOf });
    expect(values.creatinine).toBeCloseTo(1, 6);
    expect(sources.creatinine?.label).toContain("元の値 88.4 umol/L");
  });

  it("18 歳未満や性別不明は算出しない", () => {
    expect(egfr.validate({ age: 17, sex: "female", creatinine: 1 })).toMatch(/18 歳未満/);
    expect(egfr.validate({ age: 40, sex: "unknown", creatinine: 1 })).toMatch(/性別/);
    expect(egfr.validate({ age: 40, sex: "male", creatinine: null })).toMatch(/クレアチニン/);
  });
});

describe("CHA2DS2-VASc", () => {
  it("活動中の病名だけを初期値にし、年齢と性別を加点する", () => {
    const conditions = [condition("I10"), condition("E11"), condition("I63", "resolved")];
    const { values, sources } = resolveInputs(cha2ds2vasc, { patient, conditions, observations: [], asOf });
    expect(values.hypertension).toBe(true);
    expect(values.diabetes).toBe(true);
    expect(values.stroke).toBe(false);
    expect(sources.hypertension?.resource.resourceType).toBe("Condition");
    const result = cha2ds2vasc.compute(values);
    // 高血圧 1 + 糖尿病 1 + 75 歳以上 2 + 女性 1
    expect(result.value).toBe(5);
    expect(result.interpretation).toBe("高リスク");
  });

  it("男性 0 点は低リスク", () => {
    const male: fhir4.Patient = { ...patient, gender: "male", birthDate: "1990-01-01" };
    const { values } = resolveInputs(cha2ds2vasc, { patient: male, conditions: [], observations: [], asOf });
    expect(cha2ds2vasc.compute(values)).toMatchObject({ value: 0, interpretation: "低リスク" });
  });
});

describe("qSOFA", () => {
  it("血圧パネルの component から収縮期を採る", () => {
    const panel: fhir4.Observation = {
      resourceType: "Observation",
      status: "final",
      code: { coding: [{ system: LOINC, code: "85354-9" }] },
      effectiveDateTime: "2026-10-18T10:00:00+09:00",
      component: [
        { code: { coding: [{ system: LOINC, code: "8480-6" }] }, valueQuantity: { value: 96, unit: "mmHg" } },
        { code: { coding: [{ system: LOINC, code: "8462-4" }] }, valueQuantity: { value: 60, unit: "mmHg" } },
      ],
    };
    const observations = [
      panel,
      observation({ system: LOINC, code: "9279-1" }, 24, "/min", "2026-10-18T10:00:00+09:00"),
      observation({ system: LOINC, code: "9269-2" }, 14, "", "2026-10-18T10:00:00+09:00"),
    ];
    const { values } = resolveInputs(qsofa, { patient, observations, conditions: [], asOf });
    expect(values.systolic).toBe(96);
    expect(values.respiratoryRate).toBe(24);
    expect(values.gcs).toBe(14);
    const result = qsofa.compute(values);
    expect(result.value).toBe(3);
    expect(result.interpretation).toMatch(/高リスク/);
  });
});

describe("scoreHistory", () => {
  it("計算式のコードで振り分け、新しい順に並べ、解釈は interpretation か note の 1 行目から読む", () => {
    const written = (code: fhir4.Coding, at: string, extra: Partial<fhir4.Observation>): fhir4.Observation => ({
      resourceType: "Observation",
      status: "final",
      code: { coding: [code] },
      effectiveDateTime: at,
      ...extra,
    });
    const observations = [
      written(egfr.observation, "2026-10-01T10:00:00+09:00", { valueQuantity: { value: 50, unit: "mL/min/{1.73_m2}" }, note: [{ text: "G3a\n内訳" }] }),
      written(egfr.observation, "2026-10-19T10:00:00+09:00", { valueQuantity: { value: 40 }, interpretation: [{ text: "G3b" }] }),
      written(egfr.observation, "2026-10-10T10:00:00+09:00", { status: "entered-in-error", valueQuantity: { value: 99 } }),
      written(qsofa.observation, "2026-10-19T11:00:00+09:00", { valueInteger: 2 }),
    ];
    const entries = scoreHistory(observations, egfr);
    expect(entries.map((e) => [e.value, e.interpretation])).toEqual([
      [40, "G3b"],
      [50, "G3a"],
    ]);
    expect(scoreHistory(observations, qsofa)[0]).toMatchObject({ value: 2, unit: undefined });
    expect(decodeURIComponent(scoreHistoryQuery("p1", 100))).toContain("category=http://terminology.hl7.org/CodeSystem/observation-category|survey");
  });
});
