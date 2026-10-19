import { ICD10_SYSTEMS, JLAC11, LOINC, type PatientData } from "@fhir-smart-app/scores";
import { describe, expect, it } from "vitest";
import { evaluate } from "./rules";

const now = new Date("2026-10-19T12:00:00+09:00");
const context = { now, smartAppLaunchUrl: "http://localhost:5180/launch.html" };

const patient: fhir4.Patient = { resourceType: "Patient", id: "p1", birthDate: "1945-04-01", gender: "female" };

function quantity(id: string, code: fhir4.Coding, value: number, unit: string, at: string): fhir4.Observation {
  return {
    resourceType: "Observation",
    id,
    status: "final",
    code: { coding: [code] },
    valueQuantity: { value, unit },
    effectiveDateTime: at,
  };
}

function bloodPressure(id: string, systolic: number, at: string): fhir4.Observation {
  return {
    resourceType: "Observation",
    id,
    status: "final",
    code: { coding: [{ system: LOINC, code: "85354-9" }] },
    effectiveDateTime: at,
    component: [{ code: { coding: [{ system: LOINC, code: "8480-6" }] }, valueQuantity: { value: systolic, unit: "mmHg" } }],
  };
}

function condition(code: string, status = "active"): fhir4.Condition {
  return {
    resourceType: "Condition",
    subject: { reference: "Patient/p1" },
    clinicalStatus: { coding: [{ code: status }] },
    code: { coding: [{ system: ICD10_SYSTEMS[0], code }], text: code },
  };
}

function data(observations: fhir4.Observation[], conditions: fhir4.Condition[] = []): PatientData {
  return { patient, observations, conditions };
}

describe("qSOFA", () => {
  it("24 時間以内のバイタルで 2 点以上なら warning を出し、アプリのタブを appContext で指定する", () => {
    const cards = evaluate(
      data([
        quantity("rr", { system: LOINC, code: "9279-1" }, 24, "/min", "2026-10-19T09:00:00+09:00"),
        bloodPressure("bp", 96, "2026-10-19T09:00:00+09:00"),
      ]),
      context,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      summary: "qSOFA 2 点: 敗血症の評価を検討",
      indicator: "warning",
      links: [{ type: "smart", url: context.smartAppLaunchUrl, appContext: '{"score":"qsofa"}' }],
    });
    expect(cards[0]!.detail).toContain("呼吸数: 24 /min(2026-10-19)");
  });

  it("24 時間を過ぎたバイタルでは出さない", () => {
    const cards = evaluate(
      data([
        quantity("rr", { system: LOINC, code: "9279-1" }, 24, "/min", "2026-10-18T09:00:00+09:00"),
        bloodPressure("bp", 96, "2026-10-18T09:00:00+09:00"),
      ]),
      context,
    );
    expect(cards).toHaveLength(0);
  });
});

describe("eGFR", () => {
  const creatinine = (value: number, at: string) =>
    quantity("cr", { system: JLAC11, code: "C3002000025003085" }, value, "mg/dL", at);

  it("45 未満で info、30 未満で warning", () => {
    // 81 歳女性: Cr 1.0 → 約 40、Cr 1.5 → 約 26
    expect(evaluate(data([creatinine(1.0, "2026-10-01")]), context)[0]).toMatchObject({ indicator: "info" });
    expect(evaluate(data([creatinine(1.5, "2026-10-01")]), context)[0]).toMatchObject({ indicator: "warning" });
  });

  it("45 以上や 90 日より古い値では出さない", () => {
    expect(evaluate(data([creatinine(0.6, "2026-10-01")]), context)).toHaveLength(0);
    expect(evaluate(data([creatinine(1.5, "2026-07-01")]), context)).toHaveLength(0);
  });
});

describe("CHA2DS2-VASc", () => {
  it("活動中の心房細動があるときだけ計算する", () => {
    // 81 歳女性 + 高血圧: 2 + 1 + 1 = 4 点
    const withAf = evaluate(data([], [condition("I480"), condition("I10")]), context);
    expect(withAf).toHaveLength(1);
    expect(withAf[0]!.summary).toContain("CHA₂DS₂-VASc 4 点");
    expect(withAf[0]!.detail).toContain("高血圧: I10");

    expect(evaluate(data([], [condition("I10")]), context)).toHaveLength(0);
    expect(evaluate(data([], [condition("I480", "resolved"), condition("I10")]), context)).toHaveLength(0);
  });
});
