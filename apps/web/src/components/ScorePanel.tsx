import {
  resolveInputs,
  scoreHistory,
  type ScoreHistoryEntry,
  type InputValue,
  type InputValues,
  type PatientData,
  type ScoreDefinition,
  type ScoreInput,
  type Sex,
} from "@fhir-smart-app/scores";
import { useMemo, useState } from "react";
import { formatDateTime, localDay, today } from "../dates";
import { buildObservation, createObservation } from "../fhir/writeBack";
import { canCreateObservation } from "../smart/scope";
import type { SmartSession } from "../smart/session";

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
  { value: "other", label: "その他" },
  { value: "unknown", label: "不明" },
];

interface Props {
  score: ScoreDefinition;
  session: SmartSession;
  data: PatientData;
  /** 書き戻した計算結果(全計算式)。この計算式の分だけを使う。 */
  history: readonly fhir4.Observation[];
  onSaved: (observation: fhir4.Observation) => void;
}

/** 履歴に出す件数。 */
const HISTORY_ROWS = 10;

function formatValue(entry: Pick<ScoreHistoryEntry, "value" | "unit">): string {
  if (entry.value === null) return "-";
  return entry.unit ? `${entry.value} ${entry.unit}` : `${entry.value} 点`;
}

export function ScorePanel({ score, session, data, history, onSaved }: Props) {
  const resolved = useMemo(() => resolveInputs(score, data), [score, data]);
  const entries = useMemo(() => scoreHistory(history, score), [history, score]);
  const [values, setValues] = useState<InputValues>(resolved.values);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const problem = score.validate(values);
  const result = problem ? null : score.compute(values);
  const writable = canCreateObservation(session.grantedScope);
  const previous = entries[0];
  // 今日すでに同じ値を登録していれば二重登録になる。入力を直して値が変わったときは登録できる。
  const todayKey = today();
  const alreadySaved =
    result !== null && entries.some((e) => localDay(e.effective) === todayKey && e.value === result.value);

  function set(key: string, value: InputValue) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createObservation(session.client, buildObservation(score, result, session, resolved.sources));
      onSaved(created);
    } catch (error) {
      setSaveError(String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="score" aria-label={score.name}>
      <div>
        <div className="inputs">
          {score.inputs.map((input) => (
            <InputRow key={input.key} input={input} value={values[input.key] ?? null} source={resolved.sources[input.key]?.label} onChange={(v) => set(input.key, v)} />
          ))}
        </div>
        <p className="reference">{score.reference}</p>
      </div>
      <div className="result">
        {result ? (
          <>
            <div>
              <span className="value">{result.value}</span>
              <span className="unit">{result.unit ?? "点"}</span>
            </div>
            <div>{result.interpretation}</div>
            <table>
              <tbody>
                {result.details.map((d) => (
                  <tr key={d.label}>
                    <td>{d.label}</td>
                    <td>{d.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {writable && (
              <div className="actions">
                <button className="primary" onClick={save} disabled={saving || alreadySaved}>
                  {alreadySaved ? "登録済" : "登録"}
                </button>
                {saveError && <span className="error">{saveError}</span>}
              </div>
            )}
          </>
        ) : (
          <p className="muted">{problem}</p>
        )}
        {previous && (
          <p className="previous">
            前回 {formatDateTime(previous.effective)} {formatValue(previous)}
            {previous.interpretation && `(${previous.interpretation})`}
          </p>
        )}
      </div>
      {entries.length > 0 && (
        <div className="history">
          <h2>履歴</h2>
          <table>
            <thead>
              <tr>
                <th>日時</th>
                <th>値</th>
                <th>解釈</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, HISTORY_ROWS).map((entry, index) => (
                <tr key={entry.observation.id ?? index}>
                  <td>{formatDateTime(entry.effective)}</td>
                  <td>{formatValue(entry)}</td>
                  <td>{entry.interpretation}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length > HISTORY_ROWS && <p className="muted">直近 {HISTORY_ROWS} 件(全 {entries.length} 件)</p>}
        </div>
      )}
    </section>
  );
}

function InputRow({
  input,
  value,
  source,
  onChange,
}: {
  input: ScoreInput;
  value: InputValue;
  source: string | undefined;
  onChange: (value: InputValue) => void;
}) {
  const id = `input-${input.key}`;
  let field: React.ReactNode;
  switch (input.kind) {
    case "age":
      field = (
        <input id={id} type="number" min={0} value={typeof value === "number" ? value : ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
      );
      break;
    case "sex":
      field = (
        <select id={id} value={typeof value === "string" ? value : "unknown"} onChange={(e) => onChange(e.target.value as Sex)}>
          {SEX_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case "quantity":
      field = (
        <>
          <input id={id} type="number" step="any" value={typeof value === "number" ? value : ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
          <span className="muted">{input.unit}</span>
          {source && <span className="source">{source}</span>}
        </>
      );
      break;
    case "boolean":
      field = (
        <>
          <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {source && <span className="source">{source}</span>}
        </>
      );
      break;
  }
  return (
    <>
      <label htmlFor={id}>{input.label}</label>
      <div className="field">{field}</div>
    </>
  );
}
