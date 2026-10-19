/**
 * patient-view で出すカードの判定。計算は packages/scores の計算式をそのまま使い、
 * ここでは「どの入力をいつまでの値なら使うか」と「どの値でカードを出すか」だけを決める。
 *
 * 入力が古い・足りないときはカードを出さない(判断支援が黙って外れる方に倒す)。
 */
import { type PatientData, type ResolvedInputs, type ScoreDefinition, type ScoreResult } from "@fhir-smart-app/scores";
import type { Card } from "./hooks";
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
export declare const RULES: readonly Rule[];
export declare const OVERRIDE_REASON_SYSTEM = "http://fhir-smart-app.local/CodeSystem/override-reason";
export declare function evaluate(data: PatientData, context: RuleContext): Card[];
export {};
//# sourceMappingURL=rules.d.ts.map