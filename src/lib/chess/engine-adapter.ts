import type { EngineCandidate } from "./types";

/** Mate score encoding: magnitude close to MATE_SCORE_BASE, closer = faster mate. */
const MATE_SCORE_BASE = 100_000;

export interface AnalysisOptions {
  multiPv?: number;
  moveTimeMs?: number;
}

export interface EngineAnalysis {
  bestMove: string;
  candidates: EngineCandidate[];
}

export interface EngineAdapter {
  analyze(fen: string, options: AnalysisOptions): Promise<EngineAnalysis>;
  stop(): void;
  dispose(): void;
}

export function parseEngineInfo(line: string): { multipv: number; candidate: EngineCandidate } | null {
  const depth = line.match(/\bdepth (\d+)/);
  const score = line.match(/\bscore (cp|mate) (-?\d+)/);
  const pv = line.match(/\bpv ((?:[a-h][1-8][a-h][1-8][qrbn]?\s*)+)/);
  if (!depth || !score || !pv) return null;
  const moves = pv[1].trim().split(/\s+/);
  const multipv = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1);
  const mateIn = Number(score[2]);
  const mateScore = (mateIn < 0 ? -1 : 1) * (MATE_SCORE_BASE - Math.abs(mateIn));
  return {
    multipv,
    candidate: {
      uci: moves[0],
      scoreCp: score[1] === "mate" ? mateScore : Number(score[2]),
      depth: Number(depth[1]),
      pv: moves,
    },
  };
}

/**
 * Drives Lozza (github.com/op12no2/lozza, MIT), a pure-JavaScript UCI engine
 * with an NNUE evaluation. It speaks the same UCI-over-postMessage shape as
 * Stockfish.js (uci/isready/position/go, uciok/readyok/info/bestmove), so
 * this adapter's protocol handling is unchanged from that engine — the one
 * real difference is that Lozza has no UCI_LimitStrength/UCI_Elo option.
 * Approximate strength is simulated by the caller (see engine-strength.ts):
 * scaling moveTimeMs down for weaker settings, and weighting which MultiPV
 * candidate gets played rather than always the top one.
 */
export class BrowserLozzaAdapter implements EngineAdapter {
  private worker?: Worker;
  private ready?: Promise<void>;
  private cancelSearch?: () => void;

  private waitFor(message: string, timeoutMs: number): Promise<void> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error("Engine is unavailable"));
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => finish(new Error(`Engine did not respond with ${message}`)), timeoutMs);
      const onMessage = (event: MessageEvent<string>) => {
        if (String(event.data).includes(message)) finish();
      };
      const onError = () => finish(new Error("Engine worker failed"));
      const finish = (error?: Error) => {
        window.clearTimeout(timeout);
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        if (error) reject(error);
        else resolve();
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError, { once: true });
    });
  }

  private initialize(): Promise<void> {
    if (this.ready) return this.ready;
    this.worker = new Worker("/engine/lozza.js");
    this.ready = (async () => {
      const uciReady = this.waitFor("uciok", 15_000);
      this.worker?.postMessage("uci");
      await uciReady;
      // Lozza refuses "position"/"go" until a ucinewgame (or a hash setoption) has been
      // sent at least once — without this it replies with an "info do a ucinewgame..." line
      // instead of analyzing.
      this.worker?.postMessage("ucinewgame");
      await this.synchronize();
    })().catch((error) => {
      this.worker?.terminate();
      this.worker = undefined;
      this.ready = undefined;
      throw error;
    });
    return this.ready;
  }

  private async synchronize(): Promise<void> {
    const ready = this.waitFor("readyok", 5_000);
    this.worker?.postMessage("isready");
    await ready;
  }

  async analyze(fen: string, options: AnalysisOptions): Promise<EngineAnalysis> {
    await this.initialize();
    this.stop();
    await this.synchronize();
    const worker = this.worker;
    if (!worker) throw new Error("Engine is unavailable");
    const multiPv = Math.max(1, Math.min(5, options.multiPv ?? 1));
    const moveTimeMs = Math.max(80, options.moveTimeMs ?? 300);
    const candidates = new Map<number, EngineCandidate>();

    return new Promise<EngineAnalysis>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => finish(new Error("Engine search timed out")), Math.max(5_000, moveTimeMs * 8));
      const onMessage = (event: MessageEvent<string>) => {
        const line = String(event.data);
        const info = parseEngineInfo(line);
        if (info) candidates.set(info.multipv, info.candidate);
        const best = line.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (best) {
          finish(undefined, {
            bestMove: best[1],
            candidates: [...candidates.values()].sort((a, b) => b.scoreCp - a.scoreCp),
          });
        }
      };
      // Kept for the whole search, not just the handshake — a worker crash mid-search
      // must fail fast to the caller's fallback move instead of hanging until timeout.
      const onWorkerError = () => finish(new Error("Engine worker failed"));
      const cleanup = () => {
        window.clearTimeout(timeout);
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onWorkerError);
        if (this.cancelSearch === cancel) this.cancelSearch = undefined;
      };
      const finish = (error?: Error, result?: EngineAnalysis) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else if (result) resolve(result);
      };
      const cancel = () => finish(new DOMException("Search replaced", "AbortError"));
      this.cancelSearch = cancel;
      worker.addEventListener("message", onMessage);
      worker.postMessage(`setoption name MultiPV value ${multiPv}`);
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go movetime ${moveTimeMs}`);
    });
  }

  stop(): void {
    if (!this.cancelSearch) return;
    this.worker?.postMessage("stop");
    this.cancelSearch();
  }

  dispose(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = undefined;
  }
}
