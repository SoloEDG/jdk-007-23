import { createEngine, bindPerformanceInput } from "@/features/instruments";
import { createTransport, scheduleWindow } from "@/features/transport";
import { createRecorder } from "@/features/recorder";
import {
  createArrangement,
  demoSession,
  saveSession,
  loadSession,
} from "@/features/arrangement";
import { createMixer } from "@/features/mixer";
import {
  GROOVE_OFF,
  MAX_OFFSET,
  createGrooveSync,
  grooveHit,
  sanitizeGroove,
} from "@/features/groove";
import type {
  NoteInput,
  Instrument,
  Session,
  GrooveParams,
  ScheduledNote,
  Track,
} from "@/shared/types";
export function createStudio(notify: () => void) {
  const engine = createEngine(),
    transport = createTransport(),
    recorder = createRecorder(),
    arrangement = createArrangement(),
    mixer = createMixer(),
    grooveSync = createGrooveSync();
  const active = new Set<string>();
  const scheduledVoices = new Map<string, { trackId: string; when: number }>();
  let message = "欢迎来到夜航。戴上耳机，试着敲下第一拍。",
    audition: { trackId: string; draft: GrooveParams } | null = null,
    paused = false,
    epoch = 0,
    disposed = false;
  const now = () => engine.context?.currentTime ?? 0;
  const feedback = (text: string) => {
    message = text;
    notify();
  };
  const guard = (fn: () => void) => {
    try {
      fn();
      notify();
    } catch (error) {
      feedback(
        error instanceof Error ? error.message : "操作失败，现有作品已保留",
      );
    }
  };
  const syncMixer = () =>
    mixer.ensure(arrangement.snapshot().tracks.map((t) => t.id));
  const desiredFor =
    (tracks: readonly Track[]) =>
    (id: string): GrooveParams =>
      audition?.trackId === id
        ? audition.draft
        : (tracks.find((t) => t.id === id)?.groove ?? GROOVE_OFF);
  const settleGroove = () => {
    const tracks = arrangement.snapshot().tracks;
    grooveSync.settle(
      tracks.map((t) => t.id),
      desiredFor(tracks),
    );
  };
  const playScheduled = (n: ScheduledNote) => {
    const id = engine.play(n);
    if (id) scheduledVoices.set(id, { trackId: n.trackId, when: n.when });
  };
  const pruneVoices = (time: number) => {
    for (const [id, v] of scheduledVoices)
      if (v.when + 65 < time) scheduledVoices.delete(id);
  };
  const cancelVoices = () => {
    engine.cancel();
    active.clear();
    scheduledVoices.clear();
  };
  const stop = () => {
    epoch++;
    paused = false;
    transport.stop();
    recorder.cancel();
    cancelVoices();
    settleGroove();
    notify();
  };
  const pause = () => {
    epoch++;
    paused = true;
    transport.pause(now());
    recorder.cancel();
    cancelVoices();
    feedback("播放已暂停；未完成录音已取消，原片段保留。");
  };
  const unlock = async () => {
    const context = await engine.unlock();
    if (disposed) return false;
    mixer.attach(context);
    syncMixer();
    engine.route(mixer.channel);
    return true;
  };
  const play = async () => {
    const token = ++epoch;
    try {
      if (!(await unlock()) || token !== epoch) return;
      if (transport.view(now()).running) return;
      // Fresh start: apply desired params at once. Resuming from pause keeps
      // the queued version so it still switches at the loop boundary.
      if (!paused) settleGroove();
      paused = false;
      transport.start(now() + 0.02);
      tick();
      notify();
    } catch {
      feedback("声音启动失败，请再次点击播放");
    }
  };
  const tick = () => {
    const time = now(),
      view = transport.view(time);
    const take = recorder.advance(view.absolute);
    if (take)
      guard(() => {
        arrangement.commit(take.trackId, take.notes);
        message = `录制完成 · ${take.notes.length} 个音符`;
      });
    const capture = recorder.snapshot();
    const ceiling =
      capture.status === "idle" ? Infinity : capture.start + capture.length;
    const window = transport.window(time, ceiling);
    if (window) {
      const tracks = arrangement.forPlayback();
      grooveSync.sync(
        tracks.map((t) => t.id),
        desiredFor(tracks),
        Math.floor(view.absolute / view.beats + 1e-9),
        view.running,
      );
      // At transport start, look behind so a downbeat pulled before beat 1
      // by a negative offset still sounds instead of being dropped.
      const from = window.from <= 0 ? window.from - MAX_OFFSET : window.from;
      scheduleWindow(
        tracks,
        (id) => grooveSync.segments(id),
        grooveHit,
        from,
        window.to,
        view.beats,
        view.bpm,
        window.timeAt,
        playScheduled,
      );
      pruneVoices(time);
    }
  };
  // Cancel audition: revoke this track's not-yet-sounding voices (the
  // pre-scheduled new version) and re-emit the covered window with the
  // committed params. Other tracks and already-ringing notes are untouched.
  const reemitTrack = (
    trackId: string,
    view: ReturnType<typeof transport.view>,
  ) => {
    const time = now();
    for (const [id, v] of scheduledVoices)
      if (v.trackId === trackId && v.when > time + 0.01) {
        engine.stopVoice(id);
        scheduledVoices.delete(id);
      }
    const track = arrangement.forPlayback().find((t) => t.id === trackId);
    const from = view.absolute + (0.01 * view.bpm) / 60;
    if (!track || view.frontier <= from) return;
    scheduleWindow(
      [track],
      (id) => grooveSync.segments(id),
      grooveHit,
      from,
      view.frontier,
      view.beats,
      view.bpm,
      transport.timeAt,
      playScheduled,
    );
  };
  const down = async (id: string, note: NoteInput) => {
    if (active.has(id)) return;
    active.add(id);
    notify();
    try {
      if (!(await unlock()) || !active.has(id)) return;
      const target = arrangement.selected();
      if (!target || target.instrument !== note.instrument) {
        active.delete(id);
        feedback("请先选择对应乐器的轨道");
        return;
      }
      const abs = transport.view(now()).absolute;
      const take = recorder.advance(abs);
      if (take) arrangement.commit(take.trackId, take.notes);
      recorder.down(id, note, abs);
      engine.play(
        {
          ...note,
          trackId: target.id,
          duration: note.instrument === "keys" ? 6 : 0.3,
          when: now(),
        },
        id,
      );
    } catch {
      active.delete(id);
      feedback("请点击播放以启用声音");
    }
  };
  const up = (id: string) => {
    if (!active.delete(id)) return;
    recorder.up(id, transport.view(now()).absolute);
    engine.release(id);
    notify();
  };
  const install = (session: Session) => {
    stop();
    audition = null;
    grooveSync.reset();
    const valid = arrangement.restore(session);
    transport.configure(valid.bpm, valid.beats);
    mixer.restore(valid.channels, valid.master);
    notify();
  };
  const timer = window.setInterval(() => {
    tick();
    notify();
  }, 20);
  const unbind = bindPerformanceInput((id, note) => void down(id, note), up);
  const shortcut = (e: KeyboardEvent) => {
    if (
      e.code === "Space" &&
      !e.repeat &&
      !/INPUT|TEXTAREA|SELECT|BUTTON/.test((e.target as HTMLElement).tagName)
    ) {
      e.preventDefault();
      if (transport.view(now()).running) pause();
      else void play();
    }
  };
  const blur = () => {
    for (const id of [...active]) up(id);
  };
  window.addEventListener("keydown", shortcut);
  window.addEventListener("blur", blur);
  return {
    view() {
      return {
        transport: transport.view(now()),
        arrangement: arrangement.snapshot(),
        selected: arrangement.selected(),
        recorder: recorder.snapshot(),
        mixer: mixer.snapshot(),
        active: new Set(active),
        audition: audition
          ? { trackId: audition.trackId, draft: audition.draft }
          : null,
        message,
      };
    },
    play,
    pause,
    stop,
    down: (id: string, n: NoteInput) => void down(id, n),
    up,
    configure(bpm: number, beats: number) {
      stop();
      transport.configure(bpm, beats);
      arrangement.resizeLoop(transport.view(now()).beats);
      feedback("速度或长度变更：播放回到起点；缩短时移除范围外音符。");
    },
    add(kind: Instrument) {
      if (audition) return;
      guard(() => {
        arrangement.add(kind);
        syncMixer();
      });
    },
    select(id: string) {
      if (recorder.snapshot().status !== "idle" || audition) return;
      engine.releaseHeld();
      active.clear();
      arrangement.select(id);
      notify();
    },
    remove() {
      if (audition) return;
      guard(() => {
        const selected = arrangement.selected();
        if (selected) {
          stop();
          arrangement.remove(selected.id);
          syncMixer();
        }
      });
    },
    clear() {
      if (audition) return;
      guard(() => {
        const t = arrangement.selected();
        if (t) {
          stop();
          arrangement.clear(t.id);
        }
      });
    },
    async record() {
      const selected = arrangement.selected();
      if (!selected) return;
      const token = ++epoch;
      try {
        if (!(await unlock()) || token !== epoch) return;
        const state = transport.view(now());
        if (!state.running) {
          if (!paused) settleGroove();
          paused = false;
          transport.start(now() + 0.02);
        }
        recorder.arm(
          selected.id,
          selected.instrument,
          transport.view(now()).absolute,
          state.beats,
        );
        tick();
        notify();
      } catch {
        feedback("录音启动失败，请重试");
      }
    },
    grooveDraft(params: GrooveParams) {
      const t = arrangement.selected();
      if (!t || recorder.snapshot().status !== "idle") return;
      if (audition && audition.trackId !== t.id) return;
      const first = !audition;
      audition = { trackId: t.id, draft: sanitizeGroove(params) };
      if (first) message = "律动试听中 · 确认后保存为轨道参数，原始音符不变";
      notify();
    },
    grooveConfirm() {
      if (!audition || recorder.snapshot().status !== "idle") return;
      const a = audition;
      audition = null;
      guard(() => {
        arrangement.setGroove(a.trackId, a.draft);
        message = transport.view(now()).running
          ? "律动已确认 · 从下一圈开始生效"
          : "律动已应用 · 原始音符保持不变";
      });
    },
    grooveCancel() {
      if (!audition || recorder.snapshot().status !== "idle") return;
      const trackId = audition.trackId;
      audition = null;
      const view = transport.view(now());
      if (view.running) {
        grooveSync.sync(
          [trackId],
          desiredFor(arrangement.snapshot().tracks),
          Math.floor(view.absolute / view.beats + 1e-9),
          true,
        );
        reemitTrack(trackId, view);
      }
      feedback("已取消试听 · 恢复原来的律动");
    },
    cancel() {
      recorder.cancel();
      feedback("本次录音已取消，之前的片段仍然保留。");
    },
    grid(n: number) {
      recorder.grid(n);
      notify();
    },
    volume(id: string, n: number) {
      mixer.volume(id, n);
      notify();
    },
    mute(id: string) {
      mixer.mute(id);
      notify();
    },
    master(n: number) {
      mixer.master(n);
      notify();
    },
    demo() {
      guard(() => {
        install(demoSession());
        message = "示范已载入 · 点击播放，听听凌晨两点。";
      });
    },
    save() {
      guard(() => {
        if (recorder.snapshot().status !== "idle")
          throw new Error("请完成或取消录音后再保存");
        const a = arrangement.snapshot(),
          t = transport.view(now()),
          m = mixer.snapshot();
        saveSession({
          version: 1,
          title: a.title,
          bpm: t.bpm,
          beats: t.beats,
          tracks: a.tracks,
          channels: m.channels,
          master: m.master,
        });
        message = "作品已保存到本机浏览器";
      });
    },
    load() {
      guard(() => {
        const session = loadSession();
        install(session);
        message = "本地作品已恢复";
      });
    },
    dispose() {
      disposed = true;
      epoch++;
      clearInterval(timer);
      unbind();
      window.removeEventListener("keydown", shortcut);
      window.removeEventListener("blur", blur);
      mixer.dispose();
      engine.dispose();
    },
  };
}
export type Studio = ReturnType<typeof createStudio>;
