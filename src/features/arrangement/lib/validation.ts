import type { Session, Track, Note, GrooveParams } from "@/shared/types";
import { GROOVE_OFF } from "@/features/groove";
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const finite = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
// Sessions saved before the groove layer existed carry no params; they load
// with processing off. Present params must be in range.
function validateGroove(raw: unknown): GrooveParams {
  if (raw === undefined) return { ...GROOVE_OFF };
  if (
    !object(raw) ||
    !finite(raw.swing, 0, 1) ||
    !finite(raw.accent, 0, 1) ||
    !finite(raw.humanize, 0, 1) ||
    !Number.isInteger(raw.seed) ||
    (raw.seed as number) < 1 ||
    (raw.seed as number) > 2147483647
  )
    throw new Error("律动参数无效");
  const g = raw as unknown as GrooveParams;
  return {
    swing: g.swing,
    accent: g.accent,
    humanize: g.humanize,
    seed: g.seed,
  };
}
export function validateSession(raw: unknown): Session {
  if (
    !object(raw) ||
    raw.version !== 1 ||
    typeof raw.title !== "string" ||
    raw.title.length > 80 ||
    !finite(raw.bpm, 40, 220) ||
    ![4, 8, 16, 32].includes(raw.beats as number) ||
    !Array.isArray(raw.tracks) ||
    raw.tracks.length > 8 ||
    !object(raw.channels) ||
    !finite(raw.master, 0, 1)
  )
    throw new Error("存档格式或版本不受支持");
  const ids = new Set<string>();
  const noteIds = new Set<string>();
  for (const value of raw.tracks) {
    if (!object(value)) throw new Error("轨道损坏");
    const t = value as unknown as Track;
    if (
      typeof t.id !== "string" ||
      ids.has(t.id) ||
      !t.id ||
      typeof t.name !== "string" ||
      t.name.length > 32 ||
      !["drums", "keys"].includes(t.instrument) ||
      !/^#[0-9a-f]{6}$/i.test(t.color) ||
      !Array.isArray(t.notes) ||
      t.notes.length > 2048
    )
      throw new Error("轨道数据无效");
    ids.add(t.id);
    t.groove = validateGroove((value as Record<string, unknown>).groove);
    for (const n of t.notes as Note[]) {
      if (
        !object(n) ||
        typeof n.id !== "string" ||
        noteIds.has(n.id) ||
        !finite(
          n.pitch,
          t.instrument === "drums" ? 0 : 24,
          t.instrument === "drums" ? 3 : 108,
        ) ||
        !Number.isInteger(n.pitch) ||
        !finite(n.beat, 0, (raw.beats as number) - 0.000001) ||
        !finite(n.duration, 0.01, raw.beats as number) ||
        !finite(n.velocity, 0.01, 1)
      )
        throw new Error("音符数据无效");
      noteIds.add(n.id);
    }
    const c = raw.channels[t.id];
    if (!object(c) || !finite(c.volume, 0, 1) || typeof c.muted !== "boolean")
      throw new Error("混音数据无效");
  }
  return structuredClone(raw) as unknown as Session;
}
