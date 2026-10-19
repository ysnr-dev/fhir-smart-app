/**
 * 計算式の入力に使うコード体系。EHR ごとに違うのはここだけ。
 */

export const LOINC = "http://loinc.org";

/** 国内の検体検査コード。EHR(fhir-client)の jlac11 と jlac10 の体系。 */
export const JLAC11 = "http://fhir-client.local/CodeSystem/jlac11";
export const JLAC10 = "http://fhir-client.local/CodeSystem/jlac10";

/** ICD-10。国内(厚労省 2013 年版)と HL7 の sid を同じ扱いにする。 */
export const ICD10_SYSTEMS = [
  "http://jpfhir.jp/fhir/core/mhlw/CodeSystem/ICD10-2013-full",
  "http://hl7.org/fhir/sid/icd-10",
  "http://hl7.org/fhir/sid/icd-10-cm",
] as const;

/** 書き戻す Observation のうち LOINC に無いもののコード体系。 */
export const SCORE_SYSTEM = "http://fhir-smart-app.local/CodeSystem/score";

/** 書き戻す Observation の category(HL7 observation-category の survey)。 */
export const OBSERVATION_CATEGORY_SYSTEM = "http://terminology.hl7.org/CodeSystem/observation-category";

/** ICD-10 の章・細分類の前方一致を並べる。 */
export function icd10(...prefixes: string[]) {
  return prefixes.map((prefix) => ({ system: ICD10_SYSTEMS, prefix }));
}
