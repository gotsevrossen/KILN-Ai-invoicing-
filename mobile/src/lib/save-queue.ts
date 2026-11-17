export class SaveBlocked extends Error {
  readonly code = 'unsaved_changes';
  constructor(cause: unknown) { super('unsaved_changes', { cause }); }
}

type SaveResult = { ok: true } | { ok: false; error: unknown };
const signedOut = () => Object.assign(new Error('signed_out'), { code: 'signed_out' });

/** Ordered saves and typing delays, owned by one signed-in account at a time. */
export class SaveQueue {
  private tail: Promise<void> = Promise.resolve();
  private generation = 0;
  private failure: { error: unknown } | null = null;
  private waiting = new Map<string, { timer: ReturnType<typeof setTimeout>; task: () => Promise<void> }>();
  private readonly onError: (error: unknown) => void;

  constructor(onError: (error: unknown) => void) { this.onError = onError; }

  /** A result started in an old session must not update a newly loaded account. */
  scope(): () => boolean {
    const generation = this.generation;
    return () => generation === this.generation;
  }

  enqueue(task: () => Promise<void>): void {
    void this.schedule(task);
  }

  /** Durable prerequisites have been replayed successfully; a prior network error is resolved. */
  clearFailure(): void { this.failure = null; }

  private schedule(task: () => Promise<void>, requiresClean = false): Promise<SaveResult> {
    const active = this.scope();
    const operation = this.tail.then(async (): Promise<SaveResult> => {
      if (!active()) return { ok: false, error: signedOut() };
      if (requiresClean && this.failure) return { ok: false, error: this.failure.error };
      try {
        await task();
        return { ok: true };
      } catch (error) {
        if (active()) {
          this.failure = { error };
          this.onError(error);
        }
        return { ok: false, error };
      }
    });
    this.tail = operation.then(() => {});
    return operation;
  }

  debounce(key: string, task: () => Promise<void>, delay = 700): void {
    this.cancel(key);
    this.waiting.set(key, { task, timer: setTimeout(() => this.flush(key), delay) });
  }

  cancel(key: string): void {
    const pending = this.waiting.get(key);
    if (pending) clearTimeout(pending.timer);
    this.waiting.delete(key);
  }

  flush(key: string): void {
    const pending = this.waiting.get(key);
    if (!pending) return;
    this.cancel(key);
    this.enqueue(pending.task);
  }

  flushAll(): void {
    for (const key of this.waiting.keys()) this.flush(key);
  }

  /** A failed prerequisite save must stop sending an invoice or other irreversible work. */
  async wait(): Promise<void> {
    const active = this.scope();
    this.flushAll();
    let observed: Promise<void>;
    do {
      observed = this.tail;
      await observed;
      if (!active()) throw signedOut();
    } while (observed !== this.tail);
    if (this.failure) throw new SaveBlocked(this.failure.error);
  }

  /** Only publish a final state once its prerequisites and server write succeed. */
  async commit(task: () => Promise<void>, apply: () => void): Promise<void> {
    const active = this.scope();
    await this.wait();
    if (!active()) throw signedOut();
    const result = await this.schedule(task, true);
    if (!active()) throw signedOut();
    if (!result.ok) throw new SaveBlocked(result.error);
    apply();
  }

  reset(): void {
    this.generation += 1;
    this.failure = null;
    for (const key of this.waiting.keys()) this.cancel(key);
    // Already running requests may finish; old queued tasks are skipped before they start.
  }
}
