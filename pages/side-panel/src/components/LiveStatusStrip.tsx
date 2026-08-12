import StepTrail from './StepTrail';
import type { TrailStep } from '@extension/storage';
import type { LiveStatus } from '../types/status';

interface LiveStatusStripProps {
  status: LiveStatus;
  trail: TrailStep[];
}

/**
 * What the agent is doing, right now, on one line that rewrites itself.
 *
 * A task can run for minutes. It used to prove it was alive by dropping a bubble into the
 * transcript for every action, which is exactly the noise this replaces: the same information,
 * in place, above the composer where it cannot be scrolled away - with the steps so far one click
 * beneath it, so a long run can be inspected while it is still running.
 */
const LiveStatusStrip = ({ status, trail }: LiveStatusStripProps) => (
  <div className="shrink-0 space-y-1.5 px-3 pt-2">
    {/*
      role="status" is load-bearing, not decoration. Before consolidation every action appended a
      chat message, and appended transcript is what a screen reader announced. Now they all overwrite
      this line in place, so without a live region a screen-reader user gets NOTHING for the whole
      run. Polite rather than assertive: this rewrites often and must not interrupt.
    */}
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex items-center gap-2 rounded-pill bg-canvas-sunk px-3 py-1.5 shadow-neu-inset-sm">
      <span className="size-1.5 shrink-0 animate-pulse-soft rounded-pill bg-graphite" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">{status.text}</span>
      {status.maxSteps ? (
        <span className="shrink-0 font-mono text-[11px] text-ink-faint">
          {status.step ?? 0}/{status.maxSteps}
        </span>
      ) : null}
    </div>
    <StepTrail steps={trail} />
  </div>
);

export default LiveStatusStrip;
