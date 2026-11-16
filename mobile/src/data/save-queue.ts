// Saves to the server, one at a time and in order, so a quick off-then-on never reaches the
// server backwards. Plain TypeScript (no React Native), with the timers passed in, so the
// tests run it under `node --test`.
//
// A save that fails is one of two kinds:
//  - No connection: the request never got an answer (no signal, a timeout). The save stays
//    at the front and is tried again after 2 s, 5 s, 15 s, then every 30 s, or right away when
//    retryNow() is called (the app came back to the front). Later saves wait behind it.
//  - The server said no: a real answer with an error. Trying again would get the same answer,
//    so it's reported and the queue moves on.
// Anything the queue can't tell apart counts as "the server said no": a save the server
// refused is never retried forever.

/** Thrown by the data files when a request got no answer at all. */
export class NoConnection extends Error {
  constructor(message = 'No connection') {
    super(message);
    this.name = 'NoConnection';
  }
}

/** Waits between tries while there's no connection: 2 s, 5 s, 15 s, then every 30 s. */
export const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000] as const;

/** How long to wait before try number `failures + 1`, after `failures` tries got no answer. */
export function retryDelay(failures: number): number {
  const i = Math.min(Math.max(failures, 1), RETRY_DELAYS_MS.length) - 1;
  return RETRY_DELAYS_MS[i];
}

export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface QueueStatus {
  /** Saves not finished yet, including the one running. */
  pending: number;
  /** The first save is waiting for a connection. */
  offline: boolean;
}

export interface SaveQueue {
  add: (task: () => Promise<void>) => void;
  /** Try a save waiting on signal now instead of at its next try. */
  retryNow: () => void;
  /** Drops every waiting save (signing out). A save already running finishes, but nothing follows it. */
  clear: () => void;
  status: () => QueueStatus;
  /**
   * Resolves once every save so far has finished. Rejects with NoConnection as soon as the queue
   * is waiting on signal, so a caller (a customer link) fails fast instead of hanging.
   */
  settled: () => Promise<void>;
}

export function createSaveQueue({ timers, isNoConnection = (e) => e instanceof NoConnection, onChange, onRefused }: {
  timers: Timers;
  /** Tells "no connection" apart from "the server said no". */
  isNoConnection?: (error: unknown) => boolean;
  onChange?: (status: QueueStatus) => void;
  /** A save the server refused; the queue has already moved past it. */
  onRefused?: (error: unknown) => void;
}): SaveQueue {
  let tasks: (() => Promise<void>)[] = [];
  let running = false;
  let offline = false;
  let failures = 0;
  let timer: unknown = null;
  // bumped by clear(), so a save that was running when the queue was cleared is ignored
  let round = 0;
  let waiters: { resolve: () => void; reject: (e: unknown) => void }[] = [];

  const status = (): QueueStatus => ({ pending: tasks.length, offline });

  const changed = () => {
    onChange?.(status());
    if (tasks.length === 0) {
      const done = waiters;
      waiters = [];
      done.forEach((w) => w.resolve());
    } else if (offline) {
      const stuck = waiters;
      waiters = [];
      stuck.forEach((w) => w.reject(new NoConnection()));
    }
  };

  const pump = () => {
    if (running || timer !== null || tasks.length === 0) return;
    running = true;
    const mine = round;
    const task = tasks[0];
    let result: Promise<void>;
    try {
      result = task();
    } catch (e) {
      result = Promise.reject(e);
    }
    result.then(
      () => {
        if (mine !== round) return;
        tasks.shift();
        failures = 0;
        offline = false;
        running = false;
        changed();
        pump();
      },
      (e: unknown) => {
        if (mine !== round) return;
        running = false;
        if (isNoConnection(e)) {
          failures += 1;
          offline = true;
          timer = timers.setTimeout(() => {
            timer = null;
            pump();
          }, retryDelay(failures));
          changed();
          return;
        }
        tasks.shift();
        failures = 0;
        offline = false;
        onRefused?.(e);
        changed();
        pump();
      },
    );
  };

  return {
    add(task) {
      tasks.push(task);
      // waiting on signal: it joins the line behind the stuck save
      changed();
      pump();
    },
    retryNow() {
      if (timer === null) return;
      timers.clearTimeout(timer);
      timer = null;
      pump();
    },
    clear() {
      round += 1;
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
      tasks = [];
      running = false;
      offline = false;
      failures = 0;
      changed();
    },
    status,
    settled() {
      if (tasks.length === 0) return Promise.resolve();
      if (offline) return Promise.reject(new NoConnection());
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    },
  };
}
