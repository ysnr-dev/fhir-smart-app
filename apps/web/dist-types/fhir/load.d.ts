/**
 * 計算式の入力に使うリソースをまとめて読む。
 *
 * 完全一致のコード(LOINC など)は `code=` のカンマ OR で、前方一致のコード(JLAC の分析物)は
 * 検体検査のカテゴリで読んで手元で照合する。どちらも新しい順に上限件数まで。
 */
import { type PatientData } from "@fhir-smart-app/scores";
import type Client from "fhirclient/Client";
export declare function loadPatientData(client: Client, patientId: string): Promise<PatientData>;
//# sourceMappingURL=load.d.ts.map