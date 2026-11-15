import { wrap } from "@/shared/math";
export const secondsToBeats = (seconds: number, bpm: number) =>
  (seconds * bpm) / 60;
export function clockBeat(
  now: number,
  anchor: number,
  offset: number,
  bpm: number,
) {
  return offset + secondsToBeats(Math.max(0, now - anchor), bpm);
}
export function occurrenceLoops(
  beat: number,
  from: number,
  to: number,
  length: number,
) {
  // Every k identifies one loop iteration of the same note, so a hit is
  // emitted exactly once even when its processed position spills into a
  // neighbouring loop. `from` may be negative (first-window look-behind).
  const result: { k: number; at: number }[] = [];
  let k = Math.max(0, Math.ceil((from - beat) / length - 1e-9));
  for (let at = beat + k * length; at < to; at += length, k++)
    if (at >= from) result.push({ k, at });
  return result;
}
export const loopPosition = (absolute: number, beats: number) =>
  wrap(absolute, beats);
