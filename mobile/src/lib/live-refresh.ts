/** Coalesce bursts, serialize reloads, and retry a response discarded for a local edit. */
export class LiveRefresh {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private dirty = false;
  private stopped = false;

  private refresh: () => Promise<boolean>;
  private delay: number;
  constructor(refresh: () => Promise<boolean>, delay = 300) { this.refresh = refresh; this.delay = delay; }

  request = () => {
    if (this.stopped) return;
    this.dirty = true;
    if (this.running || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; void this.run(); }, this.delay);
  };

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
      if (!this.stopped && this.dirty) this.request();
    }
  }

  stop() {
    this.stopped = true;
    this.dirty = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
