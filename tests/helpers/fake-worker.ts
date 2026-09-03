type Listener = (event: { data: string }) => void;

export interface FakeEngineScript {
  /** Info lines replayed for each `go`, before the bestmove. */
  info?: string[];
  bestMove?: string;
  /** Skip the `uciok` reply, so the handshake can never complete. */
  silentHandshake?: boolean;
  /** Accept `go` but never answer it. */
  silentSearch?: boolean;
  /** Raise a worker `error` event as soon as the given command is received. */
  failOn?: string;
}

/**
 * A scripted stand-in for the Lozza worker: it speaks just enough UCI over postMessage for
 * the adapter's handshake, search, and failure paths, and records every command it was
 * sent so tests can assert on the protocol rather than on the engine's chess.
 */
export class FakeEngineWorker {
  static instances: FakeEngineWorker[] = [];
  static script: FakeEngineScript = {};

  static reset(script: FakeEngineScript = {}) {
    FakeEngineWorker.instances = [];
    FakeEngineWorker.script = script;
  }

  static get last(): FakeEngineWorker {
    const worker = FakeEngineWorker.instances.at(-1);
    if (!worker) throw new Error("No FakeEngineWorker was constructed");
    return worker;
  }

  readonly commands: string[] = [];
  terminated = false;
  private messageListeners = new Set<Listener>();
  private errorListeners = new Set<() => void>();

  constructor(public readonly url: string) {
    FakeEngineWorker.instances.push(this);
  }

  addEventListener(type: string, listener: Listener | (() => void)) {
    if (type === "message") this.messageListeners.add(listener as Listener);
    if (type === "error") this.errorListeners.add(listener as () => void);
  }

  removeEventListener(type: string, listener: Listener | (() => void)) {
    if (type === "message") this.messageListeners.delete(listener as Listener);
    if (type === "error") this.errorListeners.delete(listener as () => void);
  }

  terminate() {
    this.terminated = true;
  }

  /** Pushes a line to the adapter the way a worker would — asynchronously, but without a timer. */
  emit(data: string) {
    queueMicrotask(() => this.messageListeners.forEach((listener) => listener({ data })));
  }

  emitError() {
    queueMicrotask(() => this.errorListeners.forEach((listener) => listener()));
  }

  postMessage(command: string) {
    this.commands.push(command);
    const script = FakeEngineWorker.script;
    if (script.failOn && command.startsWith(script.failOn)) {
      this.emitError();
      return;
    }
    if (command === "uci" && !script.silentHandshake) this.emit("uciok");
    if (command === "isready") this.emit("readyok");
    if (command.startsWith("go") && !script.silentSearch) {
      (script.info ?? []).forEach((line) => this.emit(line));
      this.emit(`bestmove ${script.bestMove ?? "e2e4"}`);
    }
  }
}

/** Installs the fake as the page's Worker for the duration of a test. */
export function installFakeWorker(script: FakeEngineScript = {}) {
  FakeEngineWorker.reset(script);
  Object.defineProperty(globalThis, "Worker", { value: FakeEngineWorker, configurable: true, writable: true });
}
