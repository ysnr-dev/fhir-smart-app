import { cha2ds2vasc } from "./cha2ds2vasc";
import { egfr } from "./egfr";
import { qsofa } from "./qsofa";
import type { ScoreDefinition } from "./types";

/** 計算式の一覧。足すときはここに 1 要素足す。 */
export const SCORES: readonly ScoreDefinition[] = [egfr, cha2ds2vasc, qsofa];

export function findScore(id: string): ScoreDefinition | undefined {
  return SCORES.find((score) => score.id === id);
}
