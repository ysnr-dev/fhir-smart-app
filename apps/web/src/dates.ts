/**
 * 日時の扱い。表示と「同じ日」の判定はブラウザのタイムゾーン(施設の現地時刻)で行う。
 */

const pad = (n: number) => String(n).padStart(2, "0");

function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** オフセット付きの現在時刻(`2026-10-19T10:00:00+09:00`)。 */
export function nowFhirDateTime(now = new Date()): string {
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hh = pad(Math.floor(Math.abs(offset) / 60));
  const mm = pad(Math.abs(offset) % 60);
  return `${localDate(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${hh}:${mm}`;
}

/** FHIR の日付・日時を現地の日付にする。日付だけの値はそのまま。 */
export function localDay(value: string): string {
  if (value.length <= 10) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : localDate(date);
}

/** 履歴の表示用(`2026-10-19 10:05`)。 */
export function formatDateTime(value: string): string {
  if (value.length <= 10) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${localDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function today(now = new Date()): string {
  return localDate(now);
}
