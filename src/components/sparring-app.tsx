"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeader, type AppSection } from "./app-header";
import { HomeScreen, PracticeLibrary, RepertoireManager } from "./library-screens";
import { PracticeSetup, TrainingScreen } from "./practice-screens";
import { RepertoireEditor } from "./repertoire-editor";
import { ReviewScreen } from "./review-screen";
import { useTrainingEngine } from "./use-training-engine";
import {
  activeEdges,
  addGraphMove,
  emptyGraph,
  ensurePosition,
  mergeGraphs,
  setMainlineEdge,
  softDeleteEdge,
} from "@/lib/chess/graph";
import { planLineDeviation } from "@/lib/chess/drill";
import { seededRandom } from "@/lib/chess/deviation";
import { START_FEN } from "@/lib/chess/rules";
import {
  buildRouteIndex,
  buildSessionLines,
  decisionPositions,
  dueCount,
  grade,
  gradeForAttemptResult,
  initialReviewState,
  reviewStateId,
  selectSession,
} from "@/lib/chess/scheduling";
import {
  advanceDrillLine,
  completeSession,
  createTrainingSession,
  openReview,
  playPendingMoveAnyway,
  retryRepertoireMove,
  revealRepertoireMove,
  submitTraineeMove,
} from "@/lib/chess/training-machine";
import {
  deleteRepertoire,
  getLatestActiveSession,
  listAllReviewStates,
  listRepertoires,
  saveRepertoire,
  saveReviewState,
  saveSession,
} from "@/lib/storage/guest-store";
import type {
  DeviationFrequency,
  PositionGraph,
  Repertoire,
  ReviewState,
  TrainingSession,
  TraineeColor,
} from "@/lib/chess/types";

type Screen = "home" | "practice" | "manage" | "editor" | "setup" | "train" | "review";

function createId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function deviationChance(frequency: DeviationFrequency): number {
  if (frequency === "never") return 0;
  if (frequency === "low") return 0.1;
  if (frequency === "medium") return 0.25;
  return 0.5;
}

function appSection(screen: Screen): AppSection {
  if (screen === "practice" || screen === "setup" || screen === "train") return "practice";
  if (screen === "manage" || screen === "editor") return "repertoires";
  return "home";
}

export function SparringApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [repertoires, setRepertoires] = useState<Repertoire[]>([]);
  const [reviewStates, setReviewStates] = useState<ReviewState[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [editorPosition, setEditorPosition] = useState<string>();
  const [editorHistory, setEditorHistory] = useState<string[]>([]);
  const [strength, setStrength] = useState(1400);
  const [frequency, setFrequency] = useState<DeviationFrequency>("low");
  const [sessionSize, setSessionSize] = useState<number | "all">(20);
  const [session, setSession] = useState<TrainingSession>();
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string>();

  const repertoire = useMemo(() => repertoires.find((item) => item.id === selectedId), [repertoires, selectedId]);
  const trainingEngine = useTrainingEngine(screen === "train", session, repertoire, setSession);

  const decisions = useMemo(
    () => (repertoire ? decisionPositions(repertoire.graph, repertoire.traineeColor) : []),
    [repertoire],
  );
  const repertoireReviewStates = useMemo(
    () => (repertoire ? reviewStates.filter((state) => state.repertoireId === repertoire.id) : []),
    [repertoire, reviewStates],
  );
  const setupDueCount = useMemo(() => {
    const map = new Map(repertoireReviewStates.map((state) => [state.positionKey, state]));
    return dueCount(decisions, map);
  }, [decisions, repertoireReviewStates]);

  useEffect(() => {
    Promise.all([listRepertoires(), getLatestActiveSession(), listAllReviewStates()])
      .then(([saved, active, states]) => {
        setRepertoires(saved.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        setReviewStates(states);
        if (active && saved.some((item) => item.id === active.repertoireId)) {
          setSelectedId(active.repertoireId);
          setSession(active);
        } else {
          setSelectedId(saved[0]?.id);
        }
      })
      .catch(() => setStorageError("Local data could not be loaded. Refresh the page to try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!session) return;
    void saveSession(session).catch(() => setStorageError("This drill could not be saved locally."));
  }, [session]);

  function navigate(next: Screen) {
    setScreen(next);
  }

  function navigateSection(section: AppSection) {
    navigate(section === "repertoires" ? "manage" : section);
  }

  async function persistRepertoire(next: Repertoire) {
    setRepertoires((items) => {
      const withoutNext = items.filter((item) => item.id !== next.id);
      return [next, ...withoutNext].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
    try {
      await saveRepertoire(next);
      setStorageError(undefined);
    } catch {
      setStorageError("Your latest repertoire change could not be saved locally.");
    }
  }

  async function createRepertoire() {
    const graph = emptyGraph();
    const rootId = ensurePosition(graph, START_FEN, 0).id;
    graph.roots.push(rootId);
    const timestamp = new Date().toISOString();
    const created: Repertoire = {
      id: createId("repertoire"),
      name: "Untitled repertoire",
      traineeColor: "white",
      graph,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    };
    await persistRepertoire(created);
    setSelectedId(created.id);
    setEditorPosition(rootId);
    setEditorHistory([]);
    setScreen("editor");
  }

  function editRepertoire(id: string) {
    const target = repertoires.find((item) => item.id === id);
    if (!target) return;
    setSelectedId(id);
    setEditorPosition(target.graph.roots[0]);
    setEditorHistory([]);
    setScreen("editor");
  }

  function preparePractice(id: string) {
    setSelectedId(id);
    setScreen("setup");
  }

  async function removeRepertoire(id: string) {
    const target = repertoires.find((item) => item.id === id);
    if (!target || !window.confirm(`Delete "${target.name}" from this device?`)) return;
    try {
      await deleteRepertoire(id);
      const remaining = repertoires.filter((item) => item.id !== id);
      setRepertoires(remaining);
      setReviewStates((states) => states.filter((state) => state.repertoireId !== id));
      if (selectedId === id) setSelectedId(remaining[0]?.id);
      if (session?.repertoireId === id) setSession(undefined);
    } catch {
      setStorageError("That repertoire could not be deleted.");
    }
  }

  function updateName(name: string) {
    if (!repertoire) return;
    void persistRepertoire({ ...repertoire, name, revision: repertoire.revision + 1, updatedAt: new Date().toISOString() });
  }

  function updateColor(color: TraineeColor) {
    if (!repertoire || color === repertoire.traineeColor) return;
    const graph = structuredClone(repertoire.graph);
    Object.values(graph.edges).forEach((edge) => {
      edge.isAccepted = graph.positions[edge.from].fen.split(" ")[1] === (color === "white" ? "w" : "b");
    });
    void persistRepertoire({ ...repertoire, traineeColor: color, graph, revision: repertoire.revision + 1, updatedAt: new Date().toISOString() });
  }

  function editorMove(uci: string) {
    if (!repertoire) return;
    const currentId = editorPosition ?? repertoire.graph.roots[0];
    const existing = activeEdges(repertoire.graph, currentId).find((edge) => edge.uci === uci);
    setEditorHistory((history) => [...history, currentId]);
    if (existing) {
      setEditorPosition(existing.to);
      return;
    }
    const graph = structuredClone(repertoire.graph);
    const current = graph.positions[currentId];
    const edge = addGraphMove(graph, current.fen, uci, repertoire.traineeColor, { ply: current.minPly });
    setEditorPosition(edge.to);
    void persistRepertoire({ ...repertoire, graph, revision: repertoire.revision + 1, updatedAt: new Date().toISOString() });
  }

  function removeMove(edgeId: string) {
    if (!repertoire) return;
    const graph = softDeleteEdge(repertoire.graph, edgeId);
    void persistRepertoire({ ...repertoire, graph, revision: repertoire.revision + 1, updatedAt: new Date().toISOString() });
  }

  function setMainline(edgeId: string) {
    if (!repertoire) return;
    const graph = setMainlineEdge(repertoire.graph, edgeId);
    void persistRepertoire({ ...repertoire, graph, revision: repertoire.revision + 1, updatedAt: new Date().toISOString() });
  }

  function importGraph(graph: PositionGraph, restoreDeletedIds: Set<string>) {
    if (!repertoire) return;
    const merged = mergeGraphs(repertoire.graph, graph, restoreDeletedIds);
    void persistRepertoire({ ...repertoire, graph: merged, revision: repertoire.revision + 1, updatedAt: new Date().toISOString() });
    setEditorPosition(merged.roots[0]);
    setEditorHistory([]);
  }

  function addPendingMoveToRepertoire() {
    if (!repertoire || !session?.pendingMove) return;
    const graph = structuredClone(repertoire.graph);
    const current = graph.positions[session.positionKey];
    addGraphMove(graph, current.fen, session.pendingMove.uci, repertoire.traineeColor, { ply: current.minPly });
    void persistRepertoire({ ...repertoire, graph, revision: repertoire.revision + 1, updatedAt: new Date().toISOString() });
  }

  function startTraining() {
    if (!repertoire || !decisions.length) return;
    const statesMap = new Map(repertoireReviewStates.map((state) => [state.positionKey, state]));
    const targetKeys = selectSession(decisions, statesMap, sessionSize);
    const routeIndex = buildRouteIndex(repertoire.graph);
    const lines = buildSessionLines(repertoire.graph, targetKeys, routeIndex);
    if (!lines.length) return;
    const chance = deviationChance(frequency);
    const plannedDeviationPly = planLineDeviation(repertoire.graph, lines[0], repertoire.traineeColor, chance, seededRandom(Date.now()));
    const rootFen = repertoire.graph.positions[repertoire.graph.roots[0]].fen;
    setSession(createTrainingSession({
      repertoireId: repertoire.id,
      traineeColor: repertoire.traineeColor,
      rootFen,
      strength,
      deviationFrequency: frequency,
      plannedDeviationPly,
      drill: { lines, currentLineIndex: 0, completedLines: [], deviationChance: chance },
    }));
    setScreen("train");
  }

  /** Grades the position the just-finished line was testing and persists the new schedule. */
  function gradeCompletedLine(finished: TrainingSession, repertoireId: string) {
    const line = finished.drill?.lines[finished.drill.currentLineIndex];
    if (!line) return;
    const attempt = finished.attempts.find((item) => item.positionKey === line.targetPositionKey);
    if (!attempt) return;
    const key = reviewStateId(repertoireId, line.targetPositionKey);
    const prior = reviewStates.find((state) => state.id === key) ?? initialReviewState(repertoireId, line.targetPositionKey);
    const next = grade(prior, gradeForAttemptResult(attempt.result));
    setReviewStates((states) => [...states.filter((state) => state.id !== key), next]);
    void saveReviewState(next);
  }

  function nextLine() {
    if (!session?.drill || !repertoire) return;
    gradeCompletedLine(session, repertoire.id);
    const nextIndex = session.drill.currentLineIndex + 1;
    const line = session.drill.lines[nextIndex];
    if (!line) return reviewDrill();
    const planned = planLineDeviation(repertoire.graph, line, repertoire.traineeColor, session.drill.deviationChance, seededRandom(Date.now() + nextIndex * 997));
    const rootFen = repertoire.graph.positions[repertoire.graph.roots[0]].fen;
    setSession(advanceDrillLine(session, rootFen, planned));
  }

  function reviewDrill() {
    if (!session) return;
    if (repertoire) gradeCompletedLine(session, repertoire.id);
    setSession(openReview(session));
    setScreen("review");
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-content-center place-items-center gap-3 text-ink-muted">
        <span className="text-4xl text-accent" aria-hidden="true">♞</span>
        <p className="mono text-xs tracking-wide uppercase">Loading your repertoires…</p>
      </main>
    );
  }

  const showHeader = !["editor", "train"].includes(screen);
  const editorId = editorPosition ?? repertoire?.graph.roots[0];

  return (
    <main className="flex min-h-screen flex-col">
      {showHeader && <AppHeader active={appSection(screen)} saveStatus={storageError ? "error" : "saved"} onNavigate={navigateSection} />}
      {storageError && (
        <div role="alert" className="flex min-h-11 items-center justify-between gap-4 bg-danger-weak px-4 text-danger sm:px-9">
          <span>{storageError}</span>
          <button type="button" className="mono text-xs font-bold uppercase hover:underline" onClick={() => setStorageError(undefined)}>Dismiss</button>
        </div>
      )}
      {screen === "home" && (
        <HomeScreen
          repertoires={repertoires}
          reviewStates={reviewStates}
          session={session}
          onPractice={() => navigate("practice")}
          onManage={() => navigate("manage")}
          onResume={() => {
            if (session) {
              setSelectedId(session.repertoireId);
              setScreen(session.phase === "review" ? "review" : "train");
            }
          }}
          onEdit={editRepertoire}
        />
      )}
      {screen === "practice" && (
        <PracticeLibrary repertoires={repertoires} reviewStates={reviewStates} onPractice={preparePractice} onEdit={editRepertoire} onManage={() => navigate("manage")} />
      )}
      {screen === "manage" && (
        <RepertoireManager repertoires={repertoires} reviewStates={reviewStates} onCreate={() => void createRepertoire()} onEdit={editRepertoire} onDelete={(id) => void removeRepertoire(id)} />
      )}
      {screen === "editor" && repertoire && editorId && (
        <RepertoireEditor
          repertoire={repertoire}
          positionId={editorId}
          history={editorHistory}
          onBack={() => navigate("manage")}
          onNameChange={updateName}
          onColorChange={updateColor}
          onMove={editorMove}
          onNavigate={(positionId, history) => { setEditorPosition(positionId); setEditorHistory(history); }}
          onRemoveMove={removeMove}
          onSetMainline={setMainline}
          onImport={importGraph}
        />
      )}
      {screen === "setup" && repertoire && (
        <PracticeSetup
          repertoire={repertoire}
          strength={strength}
          frequency={frequency}
          sessionSize={sessionSize}
          decisionCount={decisions.length}
          dueCount={setupDueCount}
          onBack={() => navigate("practice")}
          onStrengthChange={setStrength}
          onFrequencyChange={setFrequency}
          onSessionSizeChange={setSessionSize}
          onStart={startTraining}
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
          onNextLine={nextLine}
          onReview={reviewDrill}
          onExit={() => navigate("home")}
        />
      )}
      {screen === "review" && session && (
        <ReviewScreen session={session} reviewStates={reviewStates} onDone={() => navigate("home")} onAgain={() => navigate("setup")} />
      )}
      {showHeader && (
        <footer className="mono mt-auto flex min-h-[54px] items-center justify-between gap-4 px-4 text-[11px] text-ink-faint sm:px-9">
          <span>Out of Book</span>
          <span>Local-only · <a href="/licenses" className="hover:text-ink">Open-source licenses</a></span>
        </footer>
      )}
    </main>
  );
}
