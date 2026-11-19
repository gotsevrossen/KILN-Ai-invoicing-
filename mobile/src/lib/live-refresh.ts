/** Coalesce bursts, serialize reloads, and retry a response discarded for a local edit. */
export class LiveRefresh {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private dirty = false;
  private stopped = false;
  // pull-to-refresh: resolved when the next reload finishes
  private waiters: (() => void)[] = [];

  private refresh: () => Promise<boolean>;
  private delay: number;
  constructor(refresh: () => Promise<boolean>, delay = 300) { this.refresh = refresh; this.delay = delay; }

  request = () => {
    if (this.stopped) return;
    this.dirty = true;
    if (this.running || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; void this.run(); }, this.delay);
  };

  /** Reload right away (skipping the short wait) and resolve once that reload has finished. */
  now = () => new Promise<void>((resolve) => {
    if (this.stopped) return resolve();
    this.waiters.push(resolve);
    this.dirty = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.running) void this.run();
  });

  private async run() {
    if (this.stopped || this.running) return;
    this.dirty = false;
    this.running = true;
    try {
      if (!await this.refresh()) this.dirty = true;
    } catch {
      // A reconnect or the periodic safety refresh retries network failures.
    } finally {
      this.running = false;
      // the pull spinner stops after one reload; a follow-up (if one is due) runs on its own
      this.waiters.splice(0).forEach((done) => done());
      if (!this.stopped && this.dirty) this.request();
    }
  }

  stop() {
    this.stopped = true;
    this.dirty = false;
    this.waiters.splice(0).forEach((done) => done());
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
