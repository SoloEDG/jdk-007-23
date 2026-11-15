import type { GrooveParams, Track } from "@/shared/types";
import {
  GROOVE_OFF,
  isGrooveOff,
  randomSeed,
  sanitizeGroove,
} from "../lib/groove";
function GrooveSlider({
  label,
  hint,
  value,
  disabled,
  change,
}: {
  label: string;
  hint: string;
  value: number;
  disabled: boolean;
  change: (n: number) => void;
}) {
  return (
    <label className="groove-slider">
      <span>
        {label} <small>{hint}</small>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => change(Number(e.target.value) / 100)}
      />
      <b>{Math.round(value * 100)}%</b>
    </label>
  );
}
export function GroovePanel({
  track,
  audition,
  locked,
  draft,
  confirm,
  cancel,
}: {
  track: Track | null;
  audition: { trackId: string; draft: GrooveParams } | null;
  locked: boolean;
  draft: (params: GrooveParams) => void;
  confirm: () => void;
  cancel: () => void;
}) {
  if (!track)
    return (
      <div className="groove-panel">
        <div className="groove-title">
          <strong>
            律动处理 <small>GROOVE</small>
          </strong>
          <em className="idle">选择一条轨道，给它一点摇摆</em>
        </div>
      </div>
    );
  const auditioning = audition?.trackId === track.id;
  const params = auditioning ? audition.draft : track.groove;
  const off = isGrooveOff(params);
  const set = (patch: Partial<GrooveParams>) =>
    draft(sanitizeGroove({ ...params, ...patch }));
  return (
    <div className="groove-panel">
      <div className="groove-title">
        <strong>
          律动处理 <small>GROOVE · {track.name}</small>
        </strong>
        {auditioning ? (
          <em>试听中 · 确认后下一圈生效</em>
        ) : (
          <em className="idle">{off ? "无处理 · 原始演奏" : "已应用"}</em>
        )}
      </div>
      <GrooveSlider
        label="摇摆"
        hint="SWING"
        value={params.swing}
        disabled={locked}
        change={(swing) => set({ swing })}
      />
      <GrooveSlider
        label="重音"
        hint="ACCENT"
        value={params.accent}
        disabled={locked}
        change={(accent) => set({ accent })}
      />
      <GrooveSlider
        label="人性化"
        hint="HUMAN"
        value={params.humanize}
        disabled={locked}
        change={(humanize) => set({ humanize })}
      />
      <div className="groove-seed">
        种子 <code>{params.seed}</code>
        <button
          disabled={locked}
          onClick={() => set({ seed: randomSeed() })}
          title="换一组固定的人性化偏移"
        >
          ↻ 换手感
        </button>
      </div>
      <div className="groove-actions">
        {auditioning ? (
          <>
            <button className="confirm" onClick={confirm}>
              ✓ 确认律动
            </button>
            <button onClick={cancel}>✕ 取消试听</button>
          </>
        ) : (
          <button
            disabled={locked || off}
            onClick={() => draft({ ...GROOVE_OFF, seed: params.seed })}
          >
            关闭处理
          </button>
        )}
      </div>
    </div>
  );
}
