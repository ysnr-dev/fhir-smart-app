/**
 * 計算式の定義と、入力値の取り出し方の型。
 *
 * 計算式は EHR を知らない純粋関数で、FHIR の値をどのコードから取るかは
 * `matchers` の対応表だけで決まる。別の EHR に持ち込むときはこの表を差し替える。
 */

/** コードの一致条件。`code` は完全一致、`prefix` は前方一致(JLAC の分析物コードや ICD-10 の章)。 */
export interface CodeMatcher {
  system: string | readonly string[];
  code?: string;
  prefix?: string;
}

/** 数値の入力。Observation の valueQuantity(`component` を指定したときはその成分)から取る。 */
export interface QuantityInput {
  kind: "quantity";
  key: string;
  label: string;
  unit: string;
  matchers: readonly CodeMatcher[];
  /** 血圧パネルの収縮期など、component から取るときの成分のコード。 */
  component?: readonly CodeMatcher[];
  /** 取り出した値の単位が違うときの換算(例: µmol/L → mg/dL)。 */
  convert?: (value: number, unit: string | undefined) => number | null;
}

/** 有無の入力。病名(Condition)のコードが一致すれば真の初期値にする。 */
export interface BooleanInput {
  kind: "boolean";
  key: string;
  label: string;
  conditions?: readonly CodeMatcher[];
}

/** 患者の属性。Patient から取る。 */
export interface DemographicInput {
  kind: "age" | "sex";
  key: string;
  label: string;
}

export type ScoreInput = QuantityInput | BooleanInput | DemographicInput;

export type Sex = "male" | "female" | "other" | "unknown";

export type InputValue = number | boolean | Sex | null;

export type InputValues = Record<string, InputValue>;

export interface ScoreResult {
  /** 算出した値。 */
  value: number;
  /** 画面と書き戻しに使う単位(UCUM)。無ければ点数。 */
  unit?: string;
  /** 解釈の一言(「G3a」「高リスク」など)。 */
  interpretation: string;
  /** 内訳(各項目の点数など)。 */
  details: readonly { label: string; value: string }[];
}

/** 書き戻す Observation のコード。 */
export interface ObservationCode {
  system: string;
  code: string;
  display: string;
}

export interface ScoreDefinition {
  id: string;
  name: string;
  /** 式の出典。 */
  reference: string;
  inputs: readonly ScoreInput[];
  /** 入力が足りなければ理由を返す。 */
  validate: (values: InputValues) => string | null;
  compute: (values: InputValues) => ScoreResult;
  observation: ObservationCode;
}
