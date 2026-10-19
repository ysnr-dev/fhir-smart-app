/** 既定で要求するスコープ。読み取りだけで、書き戻しは配布時に `user/Observation.write` を足す。 */
export const DEFAULT_SCOPE =
  "launch launch/patient launch/encounter openid fhirUser user/Patient.read user/Observation.read user/Condition.read user/Encounter.read";

/**
 * 付与されたスコープで Observation を作れるか。SMART v1(read/write/*)と v2(cruds)の両方を見る。
 */
export function canCreateObservation(grantedScope: string): boolean {
  return grantedScope.split(/\s+/).some((scope) => {
    const match = /^user\/(\*|Observation)\.(.+)$/.exec(scope);
    if (!match) return false;
    const access = match[2]!;
    return access === "write" || access === "*" || (/^[cruds]+$/.test(access) && access.includes("c"));
  });
}
