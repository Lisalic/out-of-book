import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserLozzaAdapter, isAbortError, parseEngineInfo } from "@/lib/chess/engine-adapter";
import { FakeEngineWorker, installFakeWorker } from "./helpers/fake-worker";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("UCI output parsing", () => {
  it("parses ordinary single-PV output without an explicit multipv field", () => {
    const parsed = parseEngineInfo("info depth 14 seldepth 20 score cp 37 nodes 12000 pv e2e4 e7e5 g1f3");
    expect(parsed?.multipv).toBe(1);
    expect(parsed?.candidate).toMatchObject({ uci: "e2e4", scoreCp: 37, depth: 14 });
  });

  it("encodes mate scores so distance-to-mate survives, closer mates scoring higher in magnitude", () => {
    const near = parseEngineInfo("info depth 18 multipv 1 score mate 2 nodes 50000 pv h5f7 g8h8 f7h7");
    const far = parseEngineInfo("info depth 18 multipv 1 score mate 5 nodes 50000 pv h5f7 g8h8 f7h7");
    expect(near?.candidate.scoreCp).toBeGreaterThan(far?.candidate.scoreCp ?? 0);
    expect(near?.candidate.scoreCp).toBeGreaterThanOrEqual(99_000);
  });

  it("parses a losing mate score as a large negative number, and explicit multipv", () => {
    const parsed = parseEngineInfo("info depth 18 multipv 2 score mate -3 nodes 50000 pv g7g6 h5e8");
    expect(parsed?.multipv).toBe(2);
    expect(parsed?.candidate.scoreCp).toBe(-(100_000 - 3));
  });

  it("ignores non-analysis messages", () => {
    expect(parseEngineInfo("readyok")).toBeNull();
  });
});

describe("isAbortError", () => {
  it("recognizes only a cancelled search, not a real engine failure", () => {
    expect(isAbortError(new DOMException("Search replaced", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("Engine worker failed"))).toBe(false);
    expect(isAbortError(new DOMException("Nope", "TimeoutError"))).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});

describe("BrowserLozzaAdapter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("completes the UCI handshake once, then searches on each analyze", async () => {
    installFakeWorker({ bestMove: "e2e4" });
    const adapter = new BrowserLozzaAdapter();

    await adapter.analyze(START_FEN, { multiPv: 2, moveTimeMs: 120 });
    await adapter.analyze(START_FEN, { multiPv: 2, moveTimeMs: 120 });

    // Lozza refuses position/go until a ucinewgame has been sent at least once.
    expect(FakeEngineWorker.instances).toHaveLength(1);
    expect(FakeEngineWorker.last.commands.slice(0, 3)).toEqual(["uci", "ucinewgame", "isready"]);
    expect(FakeEngineWorker.last.commands.filter((command) => command === "uci")).toHaveLength(1);
    expect(FakeEngineWorker.last.commands.filter((command) => command.startsWith("go"))).toHaveLength(2);
    adapter.dispose();
  });

  it("returns the best move with its candidates ranked best-first", async () => {
    installFakeWorker({
      bestMove: "g1f3",
      info: [
        "info depth 12 multipv 2 score cp 12 pv d2d4 d7d5",
        "info depth 12 multipv 1 score cp 48 pv g1f3 g8f6",
      ],
    });
    const adapter = new BrowserLozzaAdapter();
    const result = await adapter.analyze(START_FEN, { multiPv: 2, moveTimeMs: 150 });

    expect(result.bestMove).toBe("g1f3");
    expect(result.candidates.map((item) => item.uci)).toEqual(["g1f3", "d2d4"]);
    expect(result.candidates[0].scoreCp).toBe(48);
    adapter.dispose();
  });

  it("keeps only the latest info line per multipv slot, so a deepening search does not duplicate candidates", async () => {
    installFakeWorker({
      bestMove: "e2e4",
      info: [
        "info depth 8 multipv 1 score cp 20 pv e2e4",
        "info depth 14 multipv 1 score cp 35 pv e2e4",
      ],
    });
    const adapter = new BrowserLozzaAdapter();
    const result = await adapter.analyze(START_FEN, { multiPv: 1, moveTimeMs: 100 });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ scoreCp: 35, depth: 14 });
    adapter.dispose();
  });

  it("clamps the search request to the range the engine is driven within", async () => {
    installFakeWorker({});
    const adapter = new BrowserLozzaAdapter();
    await adapter.analyze(START_FEN, { multiPv: 99, moveTimeMs: 1 });

    expect(FakeEngineWorker.last.commands).toContain("setoption name MultiPV value 5");
    expect(FakeEngineWorker.last.commands).toContain("go movetime 80");
    adapter.dispose();
  });

  it("aborts an in-flight search on stop, telling the engine to stop too", async () => {
    installFakeWorker({ silentSearch: true });
    const adapter = new BrowserLozzaAdapter();
    // Let the handshake finish before the search that will be cancelled.
    const pending = adapter.analyze(START_FEN, { multiPv: 1, moveTimeMs: 200 });
    await vi.waitFor(() => expect(FakeEngineWorker.last.commands.some((command) => command.startsWith("go"))).toBe(true));

    adapter.stop();
    await expect(pending).rejects.toSatisfy(isAbortError);
    expect(FakeEngineWorker.last.commands).toContain("stop");
    adapter.dispose();
  });

  it("fails fast to the caller when the worker crashes mid-search, rather than hanging until the timeout", async () => {
    installFakeWorker({ failOn: "go" });
    const adapter = new BrowserLozzaAdapter();
    await expect(adapter.analyze(START_FEN, { multiPv: 1, moveTimeMs: 100 })).rejects.toThrow("Engine worker failed");
    adapter.dispose();
  });

  it("gives up on a search the engine never answers", async () => {
    installFakeWorker({ silentSearch: true });
    const adapter = new BrowserLozzaAdapter();
    const pending = adapter.analyze(START_FEN, { multiPv: 1, moveTimeMs: 100 });
    await vi.waitFor(() => expect(FakeEngineWorker.last.commands.some((command) => command.startsWith("go"))).toBe(true));

    // The expectation is attached before time is advanced, so the rejection is never
    // momentarily unhandled.
    const rejection = expect(pending).rejects.toThrow("Engine search timed out");
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(5_001);
    await rejection;
    adapter.dispose();
  });

  it("reports an engine that never finishes its handshake, and can be retried afterwards", async () => {
    installFakeWorker({ silentHandshake: true });
    const adapter = new BrowserLozzaAdapter();
    vi.useFakeTimers();
    const pending = adapter.analyze(START_FEN, { multiPv: 1, moveTimeMs: 100 });
    const rejection = expect(pending).rejects.toThrow("Engine did not respond with uciok");
    await vi.advanceTimersByTimeAsync(15_001);
    await rejection;
    expect(FakeEngineWorker.last.terminated).toBe(true);

    // The failed handshake was discarded, so a later analyze starts a fresh worker.
    vi.useRealTimers();
    FakeEngineWorker.script = { bestMove: "d2d4" };
    const retry = await adapter.analyze(START_FEN, { multiPv: 1, moveTimeMs: 100 });
    expect(retry.bestMove).toBe("d2d4");
    expect(FakeEngineWorker.instances).toHaveLength(2);
    adapter.dispose();
  });

  it("terminates the worker on dispose", async () => {
    installFakeWorker({});
    const adapter = new BrowserLozzaAdapter();
    await adapter.analyze(START_FEN, { multiPv: 1, moveTimeMs: 100 });
    adapter.dispose();
    expect(FakeEngineWorker.last.terminated).toBe(true);
  });
});
