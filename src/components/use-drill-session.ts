"use client";

import { useCallback, useMemo } from "react";
import { deviationChance, seededRandom } from "@/lib/chess/deviation";
import { planLineDeviation } from "@/lib/chess/drill";
import {
  dueLineCount,
  grade,
  gradeForAttemptResult,
  initialReviewState,
  repertoireLines,
  reviewStateId,
  selectLineSession,
} from "@/lib/chess/scheduling";
import { advanceDrillLine, createTrainingSession, openReview } from "@/lib/chess/training-machine";
import type {
  DeviationFrequency,
  DrillLinePlan,
  Repertoire,
  ReviewState,
  TrainingSession,
} from "@/lib/chess/types";

export interface DrillSettings {
  strength: number;
  frequency: DeviationFrequency;
  sessionSize: number | "all";
}

export interface DrillSessionArgs {
  repertoire?: Repertoire;
  reviewStates: ReviewState[];
  session?: TrainingSession;
  setSession: React.Dispatch<React.SetStateAction<TrainingSession | undefined>>;
  recordReviewStates: (states: ReviewState[]) => void;
  settings: DrillSettings;
}

export interface DrillSessionControls {
  /** Every line in the selected repertoire, whether or not it is due. */
  lines: DrillLinePlan[];
  /** How many of those lines have a decision due for review right now. */
  dueCount: number;
  /** Starts a session; false when the repertoire has no line worth drilling. */
  start: () => boolean;
  /** Grades the finished line and moves on. "review" means the session has no line left. */
  advance: () => "next_line" | "review";
  /** Grades the finished line and closes the session into its review screen. */
  finish: () => void;
}

export function useDrillSession({
  repertoire,
  reviewStates,
  session,
  setSession,
  recordReviewStates,
  settings,
}: DrillSessionArgs): DrillSessionControls {
  const lines = useMemo(
    () => (repertoire ? repertoireLines(repertoire.graph, repertoire.traineeColor) : []),
    [repertoire],
  );

  const statesByPosition = useMemo(() => {
    const map = new Map<string, ReviewState>();
    if (!repertoire) return map;
    reviewStates
      .filter((state) => state.repertoireId === repertoire.id)
      .forEach((state) => map.set(state.positionKey, state));
    return map;
  }, [repertoire, reviewStates]);

  const dueCount = useMemo(() => dueLineCount(lines, statesByPosition), [lines, statesByPosition]);

  const planDeviation = useCallback(
    (line: DrillLinePlan, chance: number, seedSalt: number) =>
      repertoire
        ? planLineDeviation(repertoire.graph, line, repertoire.traineeColor, chance, seededRandom(Date.now() + seedSalt))
        : null,
    [repertoire],
  );

  const start = useCallback(() => {
    if (!repertoire || !lines.length) return false;
    const selected = selectLineSession(lines, statesByPosition, settings.sessionSize);
    if (!selected.length) return false;
    const chance = deviationChance(settings.frequency);
    setSession(createTrainingSession({
      repertoireId: repertoire.id,
      traineeColor: repertoire.traineeColor,
      rootFen: repertoire.graph.positions[repertoire.graph.roots[0]].fen,
      strength: settings.strength,
      deviationFrequency: settings.frequency,
      plannedDeviationPly: planDeviation(selected[0], chance, 0),
      drill: { lines: selected, currentLineIndex: 0, completedLines: [], deviationChance: chance },
    }));
    return true;
  }, [repertoire, lines, statesByPosition, settings, planDeviation, setSession]);

  /** Grades every decision the just-finished line tested and persists each one's new schedule. */
  const gradeCompletedLine = useCallback(
    (finished: TrainingSession) => {
      if (!repertoire) return;
      const line = finished.drill?.lines[finished.drill.currentLineIndex];
      if (!line) return;
      const updates = line.decisionKeys
        .map((positionKey) => {
          const attempt = finished.attempts.find((item) => item.positionKey === positionKey);
          if (!attempt) return undefined;
          const id = reviewStateId(repertoire.id, positionKey);
          const prior = reviewStates.find((state) => state.id === id) ?? initialReviewState(repertoire.id, positionKey);
          return grade(prior, gradeForAttemptResult(attempt.result));
        })
        .filter((state): state is ReviewState => state !== undefined);
      recordReviewStates(updates);
    },
    [repertoire, reviewStates, recordReviewStates],
  );

  const advance = useCallback((): "next_line" | "review" => {
    if (!session?.drill || !repertoire) return "review";
    gradeCompletedLine(session);
    const nextLine = session.drill.lines[session.drill.currentLineIndex + 1];
    if (!nextLine) {
      setSession(openReview(session));
      return "review";
    }
    const planned = planDeviation(nextLine, session.drill.deviationChance, (session.drill.currentLineIndex + 1) * 997);
    setSession(advanceDrillLine(session, repertoire.graph.positions[repertoire.graph.roots[0]].fen, planned));
    return "next_line";
  }, [session, repertoire, gradeCompletedLine, planDeviation, setSession]);

  const finish = useCallback(() => {
    if (!session) return;
    gradeCompletedLine(session);
    setSession(openReview(session));
  }, [session, gradeCompletedLine, setSession]);

  return { lines, dueCount, start, advance, finish };
}
