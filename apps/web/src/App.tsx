import { SCORES, type PatientData } from "@fhir-smart-app/scores";
import { useEffect, useState } from "react";
import { PatientBanner } from "./components/PatientBanner";
import { ScorePanel } from "./components/ScorePanel";
import { loadPatientData } from "./fhir/load";
import { isLaunchError, readySession, type SmartSession } from "./smart/session";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string; relaunch: boolean }
  | { phase: "ready"; session: SmartSession; data: PatientData };

/** appContext(CDS Hooks のカードから渡る JSON)に `score` があれば、そのタブを最初に開く。 */
function initialScoreId(appContext: string | null): string {
  try {
    const parsed = appContext ? (JSON.parse(appContext) as { score?: unknown }) : null;
    if (typeof parsed?.score === "string" && SCORES.some((s) => s.id === parsed.score)) return parsed.score;
  } catch {
    // appContext は任意の文字列なので JSON でなくてもよい
  }
  return SCORES[0]!.id;
}

export function App() {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [scoreId, setScoreId] = useState<string>(SCORES[0]!.id);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await readySession();
        const data = await loadPatientData(session.client, session.patientId);
        if (cancelled) return;
        setScoreId(initialScoreId(session.appContext));
        setState({ phase: "ready", session, data });
      } catch (error) {
        if (cancelled) return;
        setState({ phase: "error", message: String(error), relaunch: isLaunchError(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === "loading") {
    return (
      <main className="app">
        <p className="muted">読み込み中...</p>
      </main>
    );
  }
  if (state.phase === "error") {
    return (
      <main className="app">
        <p className="error">{state.message}</p>
        {state.relaunch && <p className="muted">カルテの「再起動」から起動し直してください。</p>}
      </main>
    );
  }

  const { session, data } = state;
  const score = SCORES.find((s) => s.id === scoreId) ?? SCORES[0]!;
  return (
    <main className="app">
      {session.needPatientBanner && <PatientBanner patient={data.patient} fhirUser={session.fhirUser} />}
      <div className="tabs" role="tablist">
        {SCORES.map((s) => (
          <button key={s.id} role="tab" aria-selected={s.id === score.id} onClick={() => setScoreId(s.id)}>
            {s.name}
          </button>
        ))}
      </div>
      <ScorePanel key={`${score.id}:${session.patientId}`} score={score} session={session} data={data} />
    </main>
  );
}
