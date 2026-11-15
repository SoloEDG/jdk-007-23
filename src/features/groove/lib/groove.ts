import type { GrooveParams, Note } from "@/shared/types";
import { clamp, wrap } from "@/shared/math";
export const GROOVE_OFF: GrooveParams = {
  swing: 0,
  accent: 0,
  humanize: 0,
  seed: 1,
};
// Largest absolute timing shift any parameter combination can produce.
// The scheduler looks this far behind at transport start so the downbeat
// of the first loop is never lost to a negative offset.
export const MAX_OFFSET = 0.25;
const SWING_MAX = 1 / 6; // beats: off-16ths drift up to a triplet position
const HUMAN_TIME = 0.05; // beats: peak humanize timing jitter
const HUMAN_VEL = 0.18; // peak humanize velocity jitter (±18%)
export const isGrooveOff = (g: GrooveParams) =>
  g.swing === 0 && g.accent === 0 && g.humanize === 0;
export const sameGroove = (a: GrooveParams, b: GrooveParams) =>
  a.swing === b.swing &&
  a.accent === b.accent &&
  a.humanize === b.humanize &&
  a.seed === b.seed;
export const sanitizeGroove = (g: GrooveParams): GrooveParams => ({
  swing: clamp(Number.isFinite(g.swing) ? g.swing : 0, 0, 1),
  accent: clamp(Number.isFinite(g.accent) ? g.accent : 0, 0, 1),
  humanize: clamp(Number.isFinite(g.humanize) ? g.humanize : 0, 0, 1),
  seed: Math.max(1, Math.floor(g.seed) || 1),
});
export const randomSeed = () => 1 + Math.floor(Math.random() * 2147483646);
// Deterministic noise: identical for a given (seed, note id, salt) across
// preview, loop playback, and save/restore — never re-rolled on refresh.
export function hash01(seed: number, id: string, salt: number): number {
  let h = 2166136261 ^ Math.imul(seed | 0, 16777619);
  const s = `${id}:${salt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export function timingOffset(note: Note, g: GrooveParams): number {
  let offset = 0;
  if (g.swing !== 0 && Math.round(note.beat / 0.25) % 2 === 1)
    offset += g.swing * SWING_MAX;
  if (g.humanize !== 0)
    offset += (hash01(g.seed, note.id, 0) * 2 - 1) * HUMAN_TIME * g.humanize;
  return offset;
}
function accentPattern(beat: number): number {
  if (beat % 4 === 0) return 0.45;
  if (beat % 2 === 0) return 0.2;
  if (beat % 1 === 0) return 0;
  if (beat % 0.5 === 0) return -0.12;
  return -0.25;
}
export function grooveVelocity(note: Note, g: GrooveParams): number {
  let v = note.velocity;
  if (g.accent !== 0) v *= 1 + g.accent * accentPattern(note.beat);
  if (g.humanize !== 0)
    v *= 1 + (hash01(g.seed, note.id, 1) * 2 - 1) * HUMAN_VEL * g.humanize;
  return clamp(v, 0.01, 1);
}
// Per-hit processing for the scheduler. Duration is intentionally untouched:
// a note's release stays at (processed start + duration), so overlong notes
// end at the processed release point instead of the raw one.
export function grooveHit(
  note: Note,
  g: GrooveParams,
): { offset: number; velocity: number } {
  if (isGrooveOff(g)) return { offset: 0, velocity: note.velocity };
  return { offset: timingOffset(note, g), velocity: grooveVelocity(note, g) };
}
// Processed position for the timeline compare view, wrapped into the loop.
export function processNote(note: Note, g: GrooveParams, beats: number) {
  return {
    beat: wrap(note.beat + timingOffset(note, g), beats),
    duration: note.duration,
    velocity: grooveVelocity(note, g),
  };
}
