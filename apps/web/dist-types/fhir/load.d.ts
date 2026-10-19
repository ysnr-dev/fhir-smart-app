/**
 * 計算式の入力に使うリソースをまとめて読む。検索の組み立ては CDS サービスの prefetch と共通。
 */
import { type PatientData } from "@fhir-smart-app/scores";
import type Client from "fhirclient/Client";
export declare function loadPatientData(client: Client, patientId: string): Promise<PatientData>;
//# sourceMappingURL=load.d.ts.map