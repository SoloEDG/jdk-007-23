import type { Note, ScheduledNote, Track, GrooveParams } from "@/shared/types";
import { occurrenceLoops } from "../lib/timing";
export type GrooveSegment = {
  params: GrooveParams;
  minLoop: number;
  maxLoop: number;
};
export type ProcessedHit = { offset: number; velocity: number };
// Schedules one transport window. Each track resolves to one or two groove
// segments (applied params, plus a pending version from a loop boundary);
// `process` maps a note and its segment params to timing offset and velocity,
// keeping the raw note data untouched. Loop ranges are disjoint so a hit is
// never emitted for both the old and the new version.
export function scheduleWindow(
  tracks: readonly Track[],
  segmentsFor: (trackId: string) => readonly GrooveSegment[],
  process: (note: Note, params: GrooveParams) => ProcessedHit,
  from: number,
  to: number,
  beats: number,
  bpm: number,
  timeAt: (beat: number) => number,
  play: (note: ScheduledNote) => void,
) {
  for (const track of tracks) {
    const segments = segmentsFor(track.id);
    for (const note of track.notes)
      for (const segment of segments) {
        const hit = process(note, segment.params);
        for (const { k, at } of occurrenceLoops(
          note.beat + hit.offset,
          from,
          to,
          beats,
        ))
          if (k >= segment.minLoop && k < segment.maxLoop)
            play({
              trackId: track.id,
              instrument: track.instrument,
              pitch: note.pitch,
              velocity: hit.velocity,
              duration: (note.duration * 60) / bpm,
              when: timeAt(at),
            });
      }
  }
}
