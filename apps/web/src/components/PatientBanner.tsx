import { ageAt } from "@fhir-smart-app/scores";

function nameOf(patient: fhir4.Patient): string {
  const name = patient.name?.find((n) => n.use !== "old") ?? patient.name?.[0];
  if (!name) return "(氏名なし)";
  return name.text ?? [name.family, ...(name.given ?? [])].filter(Boolean).join(" ");
}

const SEX_LABEL: Record<string, string> = { male: "男性", female: "女性", other: "その他", unknown: "不明" };

export function PatientBanner({ patient, fhirUser }: { patient: fhir4.Patient; fhirUser: string | null }) {
  const age = ageAt(patient.birthDate, new Date());
  return (
    <div className="banner">
      <strong>{nameOf(patient)}</strong>
      <span>{age !== null ? `${age} 歳` : "年齢不明"}</span>
      <span>{SEX_LABEL[patient.gender ?? "unknown"]}</span>
      {patient.birthDate && <span className="muted">{patient.birthDate}</span>}
      {fhirUser && <span className="muted">利用者: {fhirUser}</span>}
    </div>
  );
}
