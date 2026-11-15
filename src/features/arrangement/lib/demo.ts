import type { Session, Note } from "@/shared/types";
import { GROOVE_OFF } from "@/features/groove";
const note = (
  pitch: number,
  beat: number,
  duration = 0.18,
  velocity = 0.8,
): Note => ({ id: crypto.randomUUID(), pitch, beat, duration, velocity });
export function demoSession(): Session {
  return {
    version: 1,
    title: "凌晨两点 / After Hours",
    bpm: 108,
    beats: 16,
    master: 0.7,
    channels: {
      rhythm: { volume: 0.8, muted: false },
      chords: { volume: 0.55, muted: false },
      lead: { volume: 0.55, muted: false },
    },
    tracks: [
      {
        id: "rhythm",
        name: "午夜鼓组",
        instrument: "drums",
        color: "#d5f377",
        groove: { swing: 0.3, accent: 0.35, humanize: 0.2, seed: 7 },
        notes: Array.from({ length: 16 }, (_, i) => [
          note(2, i, 0.12, 0.45),
          ...(i % 4 === 0 || i % 4 === 2 ? [note(0, i)] : []),
          ...(i % 4 === 1 || i % 4 === 3 ? [note(1, i, 0.2, 0.65)] : []),
        ]).flat(),
      },
      {
        id: "chords",
        name: "温暖和弦",
        instrument: "keys",
        color: "#bca5f4",
        groove: { ...GROOVE_OFF },
        notes: [0, 4, 8, 12].flatMap((b, i) =>
          [60, 64, 67].map((p) =>
            note(p + (i % 2 === 1 ? -3 : 0), b, 3.6, 0.4),
          ),
        ),
      },
      {
        id: "lead",
        name: "夜间旋律",
        instrument: "keys",
        color: "#8fbfff",
        groove: { ...GROOVE_OFF },
        notes: [72, 67, 69, 64, 67, 64, 62, 60].map((p, i) =>
          note(p, i * 2, 0.8, 0.55),
        ),
      },
    ],
  };
}
