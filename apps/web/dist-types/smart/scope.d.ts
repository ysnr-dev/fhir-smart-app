/** 既定で要求するスコープ。読み取りだけで、書き戻しは配布時に `user/Observation.write` を足す。 */
export declare const DEFAULT_SCOPE = "launch launch/patient launch/encounter openid fhirUser user/Patient.read user/Observation.read user/Condition.read user/Encounter.read";
/**
 * 付与されたスコープで Observation を作れるか。SMART v1(read/write/*)と v2(cruds)の両方を見る。
 */
export declare function canCreateObservation(grantedScope: string): boolean;
//# sourceMappingURL=scope.d.ts.map