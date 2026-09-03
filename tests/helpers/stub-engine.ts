import type { AnalysisOptions, EngineAdapter, EngineAnalysis } from "@/lib/chess/engine-adapter";

export interface StubEngine {
  factory: () => EngineAdapter;
  calls: Array<{ fen: string; options: AnalysisOptions }>;
  stopped: number;
  disposed: number;
}

/**
 * An engine the hooks can be driven with in place of a real Worker: `respond` decides what
 * each analysis returns (or throws), and every request is recorded for assertions.
 */
export function stubEngine(
  respond: (fen: string, options: AnalysisOptions) => EngineAnalysis | Promise<EngineAnalysis>,
): StubEngine {
  const stub: StubEngine = { factory: () => adapter, calls: [], stopped: 0, disposed: 0 };
  const adapter: EngineAdapter = {
    analyze: async (fen, options) => {
      stub.calls.push({ fen, options });
      return respond(fen, options);
    },
    stop: () => {
      stub.stopped += 1;
    },
    dispose: () => {
      stub.disposed += 1;
    },
  };
  return stub;
}
