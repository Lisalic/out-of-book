"use client";

import { useCallback, useEffect, useState } from "react";
import { AppHeader, type AppSection } from "./app-header";
import { HomeScreen, PracticeLibrary, RepertoireManager } from "./library-screens";
import { PracticeSetup, TrainingScreen } from "./practice-screens";
import { RepertoireEditor } from "./repertoire-editor";
import { ReviewScreen } from "./review-screen";
import { useDrillSession } from "./use-drill-session";
import { useRepertoireLibrary } from "./use-repertoire-library";
import { useTrainingEngine } from "./use-training-engine";
import { activeEdges, addGraphMove, mergeGraphs, setMainlineEdge, softDeleteEdge } from "@/lib/chess/graph";
import { withTraineeColor } from "@/lib/chess/repertoire";
import {
  completeSession,
  playPendingMoveAnyway,
  retryRepertoireMove,
  revealRepertoireMove,
  submitTraineeMove,
} from "@/lib/chess/training-machine";
import { saveSession } from "@/lib/storage/guest-store";
import type { DeviationFrequency, PositionGraph, TrainingSession, TraineeColor } from "@/lib/chess/types";

type Screen = "home" | "practice" | "manage" | "editor" | "setup" | "train" | "review";
type EditorTab = "moves" | "import";

function appSection(screen: Screen): AppSection {
  if (screen === "practice" || screen === "setup" || screen === "train") return "practice";
  if (screen === "manage" || screen === "editor") return "repertoires";
  return "home";
}

export function SparringApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedId, setSelectedId] = useState<string>();
  const [editorPosition, setEditorPosition] = useState<string>();
  const [editorHistory, setEditorHistory] = useState<string[]>([]);
  const [editorTab, setEditorTab] = useState<EditorTab>("moves");
  const [strength, setStrength] = useState(1400);
  const [frequency, setFrequency] = useState<DeviationFrequency>("low");
  const [sessionSize, setSessionSize] = useState<number | "all">(20);
  const [session, setSession] = useState<TrainingSession>();

  const resumeSession = useCallback((saved: TrainingSession) => {
    setSelectedId(saved.repertoireId);
    setSession(saved);
  }, []);
  const library = useRepertoireLibrary(resumeSession);
  // Selection is derived, not stored with a default: falling back to the newest book keeps
  // a screen reached without going through the library (Practise again, say) working, and
  // a repertoire deleted out from under the selection resolves on its own.
  const repertoire = library.repertoires.find((item) => item.id === selectedId) ?? library.repertoires[0];

  const drill = useDrillSession({
    repertoire,
    reviewStates: library.reviewStates,
    session,
    setSession,
    recordReviewStates: library.recordReviewStates,
    settings: { strength, frequency, sessionSize },
  });
  const trainingEngine = useTrainingEngine(screen === "train", session, repertoire, setSession);

  // Every session change is saved, engine replies included — that is what makes
  // "Save & exit" and a reloaded tab resume on the exact position they left.
  const { reportError } = library;
  useEffect(() => {
    if (!session) return;
    void saveSession(session).catch(() => reportError("This drill could not be saved locally."));
  }, [session, reportError]);

  function openEditor(id: string, positionId: string | undefined, tab: EditorTab) {
    setSelectedId(id);
    setEditorPosition(positionId);
    setEditorHistory([]);
    setEditorTab(tab);
    setScreen("editor");
  }

  async function createRepertoire(tab: EditorTab = "moves") {
    const created = await library.create();
    openEditor(created.id, created.graph.roots[0], tab);
  }

  function editRepertoire(id: string) {
    const target = library.repertoires.find((item) => item.id === id);
    if (target) openEditor(id, target.graph.roots[0], "moves");
  }

  async function removeRepertoire(id: string) {
    const target = library.repertoires.find((item) => item.id === id);
    if (!target || !window.confirm(`Delete "${target.name}"?`)) return;
    if (!(await library.remove(id))) return;
    if (selectedId === id) setSelectedId(undefined);
    if (session?.repertoireId === id) setSession(undefined);
  }

  function changeColor(color: TraineeColor) {
    if (!repertoire || color === repertoire.traineeColor) return;
    void library.revise(repertoire, { traineeColor: color, graph: withTraineeColor(repertoire.graph, color) });
  }

  /** Board moves in the editor either follow an existing branch or save a new one. */
  function editorMove(uci: string) {
    if (!repertoire) return;
    const currentId = editorPosition ?? repertoire.graph.roots[0];
    setEditorHistory((history) => [...history, currentId]);
    const existing = activeEdges(repertoire.graph, currentId).find((edge) => edge.uci === uci);
    if (existing) {
      setEditorPosition(existing.to);
      return;
    }
    const graph = structuredClone(repertoire.graph);
    const current = graph.positions[currentId];
    setEditorPosition(addGraphMove(graph, current.fen, uci, repertoire.traineeColor, { ply: current.minPly }).to);
    void library.revise(repertoire, { graph });
  }

  function importGraph(incoming: PositionGraph, restoreDeletedIds: Set<string>) {
    if (!repertoire) return;
    const graph = mergeGraphs(repertoire.graph, incoming, restoreDeletedIds);
    void library.revise(repertoire, { graph });
    setEditorPosition(graph.roots[0]);
    setEditorHistory([]);
  }

  /** "+ Add this move" on the coach card: saves the off-book move the trainee just tried. */
  function addPendingMoveToRepertoire() {
    if (!repertoire || !session?.pendingMove) return;
    const graph = structuredClone(repertoire.graph);
    const current = graph.positions[session.positionKey];
    if (!current) return;
    addGraphMove(graph, current.fen, session.pendingMove.uci, repertoire.traineeColor, { ply: current.minPly });
    void library.revise(repertoire, { graph });
  }

  if (library.loading) {
    return (
      <main className="grid min-h-screen place-content-center place-items-center gap-3 text-ink-muted">
        <span className="text-4xl text-accent" aria-hidden="true">♞</span>
        <p className="mono text-xs tracking-wide uppercase">Loading your repertoires…</p>
      </main>
    );
  }

  const showHeader = screen !== "editor" && screen !== "train";
  const editorId = editorPosition ?? repertoire?.graph.roots[0];

  return (
    <main className="flex min-h-screen flex-col">
      {showHeader && (
        <AppHeader
          active={appSection(screen)}
          onNavigate={(section) => setScreen(section === "repertoires" ? "manage" : section)}
        />
      )}
      {library.error && (
        <div role="alert" className="flex min-h-11 items-center justify-between gap-4 bg-danger-weak px-4 text-danger sm:px-9">
          <span>{library.error}</span>
          <button type="button" className="mono text-xs font-bold uppercase hover:underline" onClick={library.dismissError}>Dismiss</button>
        </div>
      )}
      {screen === "home" && (
        <HomeScreen
          repertoires={library.repertoires}
          reviewStates={library.reviewStates}
          session={session}
          onPractice={() => setScreen("practice")}
          onManage={() => setScreen("manage")}
          onCreate={(tab) => void createRepertoire(tab)}
          onResume={() => session && setScreen(session.phase === "review" ? "review" : "train")}
          onEdit={editRepertoire}
        />
      )}
      {screen === "practice" && (
        <PracticeLibrary
          repertoires={library.repertoires}
          reviewStates={library.reviewStates}
          onPractice={(id) => { setSelectedId(id); setScreen("setup"); }}
          onEdit={editRepertoire}
          onManage={() => setScreen("manage")}
        />
      )}
      {screen === "manage" && (
        <RepertoireManager
          repertoires={library.repertoires}
          reviewStates={library.reviewStates}
          onCreate={() => void createRepertoire()}
          onEdit={editRepertoire}
          onDelete={(id) => void removeRepertoire(id)}
        />
      )}
      {screen === "editor" && repertoire && editorId && (
        <RepertoireEditor
          repertoire={repertoire}
          positionId={editorId}
          history={editorHistory}
          initialTab={editorTab}
          onBack={() => setScreen("manage")}
          onNameChange={(name) => void library.revise(repertoire, { name })}
          onColorChange={changeColor}
          onMove={editorMove}
          onNavigate={(positionId, history) => { setEditorPosition(positionId); setEditorHistory(history); }}
          onRemoveMove={(edgeId) => void library.revise(repertoire, { graph: softDeleteEdge(repertoire.graph, edgeId) })}
          onSetMainline={(edgeId) => void library.revise(repertoire, { graph: setMainlineEdge(repertoire.graph, edgeId) })}
          onImport={importGraph}
        />
      )}
      {screen === "setup" && repertoire && (
        <PracticeSetup
          repertoire={repertoire}
          strength={strength}
          frequency={frequency}
          sessionSize={sessionSize}
          lineCount={drill.lines.length}
          dueCount={drill.dueCount}
          onBack={() => setScreen("practice")}
          onStrengthChange={setStrength}
          onFrequencyChange={setFrequency}
          onSessionSizeChange={setSessionSize}
          onStart={() => { if (drill.start()) setScreen("train"); }}
        />
      )}
      {screen === "train" && repertoire && session && (
        <TrainingScreen
          repertoire={repertoire}
          session={session}
          engineStatus={trainingEngine.status}
          onMove={(uci) => setSession(submitTraineeMove(session, repertoire.graph, uci))}
          onRetry={() => setSession(retryRepertoireMove(session))}
          onRevealAnswer={() => setSession(revealRepertoireMove(session, repertoire.graph))}
          onPlayAnyway={() => setSession(playPendingMoveAnyway(session, repertoire.graph))}
          onAddToRepertoire={addPendingMoveToRepertoire}
          onEndGame={() => { trainingEngine.stop(); setSession(completeSession(session)); }}
          onNextLine={() => { if (drill.advance() === "review") setScreen("review"); }}
          onReview={() => { drill.finish(); setScreen("review"); }}
          onExit={() => setScreen("home")}
        />
      )}
      {screen === "review" && session && (
        <ReviewScreen
          session={session}
          reviewStates={library.reviewStates}
          onDone={() => setScreen("home")}
          onAgain={() => setScreen("setup")}
        />
      )}
      {showHeader && (
        <footer className="mono mt-auto flex min-h-[54px] items-center justify-between gap-4 px-4 text-[11px] text-ink-faint sm:px-9">
          <span>Out of Book</span>
          <span><a href="/licenses" className="hover:text-ink">Open-source licenses</a></span>
        </footer>
      )}
    </main>
  );
}
