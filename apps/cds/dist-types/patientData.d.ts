/**
 * hook のリクエストから計算式の入力を集める。
 *
 * prefetch を優先し、EHR が省いた key(満たせなかったテンプレート)は fhirAuthorization があれば
 * 自分で上流を読んで補う。どちらも無ければその分は空として扱う(カードを出さない側に倒れる)。
 */
import { type PatientData } from "@fhir-smart-app/scores";
import type { Config } from "./config";
import type { HookRequest } from "./hooks";
export declare function collectPatientData(serviceId: string, request: HookRequest, config: Config): Promise<PatientData | null>;
//# sourceMappingURL=patientData.d.ts.map