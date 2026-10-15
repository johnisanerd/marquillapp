import type { RenderPhase, RenderTrace } from './render-usage.types';

/**
 * Times the phases of one render session. `enter` ends the running phase and
 * starts the next; `finish` ends the last one and freezes the clock, because
 * a session that lost the race to its deadline keeps running in the
 * background and must not rewrite what was recorded.
 */
export class PhaseClock {
  private phase: RenderPhase;
  private startedAt: number;
  private readonly phaseMs: RenderTrace['phaseMs'] = {};
  private finished = false;

  constructor(
    first: RenderPhase,
    private readonly now: () => number = Date.now,
  ) {
    this.phase = first;
    this.startedAt = this.now();
  }

  enter(next: RenderPhase): void {
    if (this.finished) return;
    const at = this.now();
    this.phaseMs[this.phase] = at - this.startedAt;
    this.phase = next;
    this.startedAt = at;
  }

  finish(): RenderTrace {
    if (!this.finished) {
      this.phaseMs[this.phase] = this.now() - this.startedAt;
      this.finished = true;
    }
    return { phase: this.phase, phaseMs: { ...this.phaseMs } };
  }
}
