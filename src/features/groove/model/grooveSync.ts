import type { GrooveParams } from "@/shared/types";
import { GROOVE_OFF, sameGroove } from "../lib/groove";
export type GrooveLayer = {
  applied: GrooveParams;
  pending: { params: GrooveParams; fromLoop: number } | null;
};
// Tracks the groove parameters each track is currently scheduled with.
// Parameter changes while the transport runs are queued as `pending` and
// only take over at the next loop boundary, so a confirmed or auditioned
// version never rewrites the loop that is already playing.
export function createGrooveSync() {
  const layers = new Map<string, GrooveLayer>();
  return {
    reset() {
      layers.clear();
    },
    // Transport is stopped: the desired params apply immediately.
    settle(trackIds: readonly string[], desiredFor: (id: string) => GrooveParams) {
      for (const id of trackIds)
        layers.set(id, { applied: desiredFor(id), pending: null });
    },
    sync(
      trackIds: readonly string[],
      desiredFor: (id: string) => GrooveParams,
      loop: number,
      running: boolean,
    ) {
      for (const id of trackIds) {
        let layer = layers.get(id);
        if (!layer) {
          layer = { applied: desiredFor(id), pending: null };
          layers.set(id, layer);
        }
        if (layer.pending && loop >= layer.pending.fromLoop) {
          layer.applied = layer.pending.params;
          layer.pending = null;
        }
        const desired = desiredFor(id);
        if (sameGroove(desired, layer.applied)) layer.pending = null;
        else if (!running) {
          layer.applied = desired;
          layer.pending = null;
        } else if (!layer.pending || !sameGroove(desired, layer.pending.params))
          layer.pending = { params: desired, fromLoop: loop + 1 };
      }
      for (const id of [...layers.keys()])
        if (!trackIds.includes(id)) layers.delete(id);
    },
    segments(
      trackId: string,
    ): { params: GrooveParams; minLoop: number; maxLoop: number }[] {
      const layer = layers.get(trackId);
      if (!layer) return [{ params: GROOVE_OFF, minLoop: 0, maxLoop: Infinity }];
      return layer.pending
        ? [
            { params: layer.applied, minLoop: 0, maxLoop: layer.pending.fromLoop },
            {
              params: layer.pending.params,
              minLoop: layer.pending.fromLoop,
              maxLoop: Infinity,
            },
          ]
        : [{ params: layer.applied, minLoop: 0, maxLoop: Infinity }];
    },
  };
}
export type GrooveSync = ReturnType<typeof createGrooveSync>;
