import {
  resolveInputs,
  type InputValue,
  type InputValues,
  type PatientData,
  type ScoreDefinition,
  type ScoreInput,
  type Sex,
} from "@fhir-smart-app/scores";
import { useMemo, useState } from "react";
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
}

export function ScorePanel({ score, session, data }: Props) {
  const resolved = useMemo(() => resolveInputs(score, data), [score, data]);
  const [values, setValues] = useState<InputValues>(resolved.values);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const problem = score.validate(values);
  const result = problem ? null : score.compute(values);
  const writable = canCreateObservation(session.grantedScope);

  function set(key: string, value: InputValue) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(null);
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createObservation(session.client, buildObservation(score, result, session, resolved.sources));
      setSaved(created.id ?? "");
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
                <button className="primary" onClick={save} disabled={saving || saved !== null}>
                  {saved !== null ? "登録済" : "登録"}
                </button>
                {saveError && <span className="error">{saveError}</span>}
              </div>
            )}
          </>
        ) : (
          <p className="muted">{problem}</p>
        )}
      </div>
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
