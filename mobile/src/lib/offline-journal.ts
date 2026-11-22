export interface OfflineStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface JournalEntry<C> { id: string; command: C }
interface Envelope<S, C> {
  version: 1;
  owner: string;
  snapshot: S | null;
  entries: JournalEntry<C>[];
}

/** A single atomic record holds both the local view and its ordered, immutable mutations.
 * No authentication token, public payment link, or secret belongs in this record.
 * Storage failure is surfaced: callers must never call a memory-only save durable.
 */
export class OfflineJournal<S, C> {
  private envelope: Envelope<S, C> | null = null;
  private generation = 0;
  private running: Promise<void> | null = null;
  private readonly storage: OfflineStorage;
  private readonly prefix: string;
  constructor(storage: OfflineStorage, prefix = 'kiln.offline.v1:') {
    this.storage = storage;
    this.prefix = prefix;
  }

  open(owner: string): S | null {
    this.close();
    const raw = this.storage.getItem(this.prefix + owner);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (value !== null && (!value || typeof value !== 'object' ||
      (value as Envelope<S, C>).version !== 1 || (value as Envelope<S, C>).owner !== owner ||
      !Array.isArray((value as Envelope<S, C>).entries))) throw new Error('offline_cache_invalid');
    this.envelope = value as Envelope<S, C> | null ?? { version: 1, owner, snapshot: null, entries: [] };
    return this.envelope.snapshot;
  }

  /** Older app versions used one journal per user. Import it only for its recorded business. */
  openBusiness(userId: string, businessId: string, businessOf: (snapshot: S) => string | null): S | null {
    const scope = userId + ':' + businessId;
    if (this.storage.getItem(this.prefix + scope) !== null) return this.open(scope);
    const legacy = this.open(userId);
    const entries = legacy !== null && businessOf(legacy) === businessId ? this.commands() : null;
    this.open(scope);
    if (!entries || legacy === null) return null;
    this.append([...entries], legacy);
    return legacy;
  }

  close(): void { this.generation++; this.envelope = null; this.running = null; }
  get pending(): number { return this.envelope?.entries.length ?? 0; }
  commands(): readonly JournalEntry<C>[] { return JSON.parse(JSON.stringify(this.envelope?.entries ?? [])) as JournalEntry<C>[]; }

  private write(next: Envelope<S, C>): void {
    // JSON also removes mutable aliases. Update memory only after durable storage succeeds.
    const json = JSON.stringify(next);
    this.storage.setItem(this.prefix + next.owner, json);
    this.envelope = JSON.parse(json) as Envelope<S, C>;
  }

  save(snapshot: S): void {
    if (!this.envelope) throw new Error('signed_out');
    this.write({ ...this.envelope, snapshot });
  }

  append(entries: JournalEntry<C>[], snapshot: S): void {
    if (!this.envelope) throw new Error('signed_out');
    this.write({ ...this.envelope, snapshot, entries: [...this.envelope.entries, ...entries] });
  }

  /** Storage may become available after startup. Recover older pending commands,
   * then atomically pair them and the edits kept in memory with the CURRENT view.
   * The earlier cached view is deliberately never restored over those new edits.
   */
  resume(owner: string, entries: JournalEntry<C>[], currentSnapshot: S): void {
    this.open(owner);
    this.append(entries, currentSnapshot);
  }

  /** Stop at the first failure; dependent operations must not overtake a failed prerequisite.
   * An acknowledged command may be replayed after a crash; executors MUST be idempotent.
   */
  flush(execute: (command: C) => Promise<void>, confirmed?: (command: C) => S): Promise<void> {
    const generation = this.generation;
    // An empty run may have completed its loop while its finally callback is still
    // queued. A save appended in that gap must be drained before this caller resumes.
    if (this.running) return this.running.then(() => {
      if (generation !== this.generation) throw new Error('signed_out');
      return this.pending ? this.flush(execute, confirmed) : undefined;
    });
    const run = async () => {
      while (this.envelope?.entries.length) {
        if (generation !== this.generation) throw new Error('signed_out');
        const entry = this.envelope.entries[0];
        await execute(JSON.parse(JSON.stringify(entry.command)) as C);
        if (generation !== this.generation || !this.envelope) throw new Error('signed_out');
        const snapshot = confirmed ? confirmed(entry.command) : this.envelope.snapshot;
        this.write({ ...this.envelope, snapshot, entries: this.envelope.entries.filter((x) => x.id !== entry.id) });
      }
    };
    const promise = run().finally(() => { if (generation === this.generation) this.running = null; });
    this.running = promise;
    return promise;
  }
}
