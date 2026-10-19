import { type PatientData, type ScoreDefinition } from "@fhir-smart-app/scores";
import type { SmartSession } from "../smart/session";
interface Props {
    score: ScoreDefinition;
    session: SmartSession;
    data: PatientData;
}
export declare function ScorePanel({ score, session, data }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=ScorePanel.d.ts.map