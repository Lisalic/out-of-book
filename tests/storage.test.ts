import { Chess } from "chess.js";
import { openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import { resetDatabase } from "./helpers/database";
import { importPgn } from "@/lib/chess/pgn";
import { initialReviewState } from "@/lib/chess/scheduling";
import { createTrainingSession } from "@/lib/chess/training-machine";
import {
  deleteRepertoire,
  getLatestActiveSession,
  listAllReviewStates,
  listRepertoires,
  saveRepertoire,
  saveReviewStates,
  saveSession,
} from "@/lib/storage/guest-store";

afterEach(resetDatabase);

describe("guest IndexedDB store", () => {
  it("persists repertoires and active sessions", async () => {
    const graph = importPgn("1. e4 e5 *", "white").graph;
    await saveRepertoire({ id: "rep-storage", name: "Stored", traineeColor: "white", graph, createdAt: "2026-01-01", updatedAt: "2026-01-01", revision: 1 });
    const session = createTrainingSession({ repertoireId: "rep-storage", traineeColor: "white", rootFen: graph.positions[graph.roots[0]].fen, strength: 1400, deviationFrequency: "never", plannedDeviationPly: null });
    await saveSession(session);
    expect((await listRepertoires()).some((item) => item.id === "rep-storage")).toBe(true);
    expect((await getLatestActiveSession())?.id).toBe(session.id);
  });

  it("does not offer to resume a finished (complete or review) session", async () => {
    const base = createTrainingSession({ repertoireId: "rep-x", traineeColor: "white", rootFen: new Chess().fen(), strength: 1400, deviationFrequency: "never", plannedDeviationPly: null });
    await saveSession({ ...base, id: "s-complete", phase: "complete", updatedAt: "2026-01-01T00:00:02.000Z" });
    await saveSession({ ...base, id: "s-review", phase: "review", updatedAt: "2026-01-01T00:00:03.000Z" });
    await saveSession({ ...base, id: "s-live", phase: "trainee_turn", updatedAt: "2026-01-01T00:00:01.000Z" });
    expect((await getLatestActiveSession())?.id).toBe("s-live");
  });

  it("writes a batch of review states in one transaction and reads them all back", async () => {
    const state = initialReviewState("rep-a", "pos-1", Date.parse("2026-01-01"));
    await saveReviewStates([state, initialReviewState("rep-b", "pos-2", Date.parse("2026-01-01"))]);
    const stored = await listAllReviewStates();
    expect(stored).toHaveLength(2);
    expect(stored.find((item) => item.repertoireId === "rep-a")).toEqual(state);
  });

  it("overwrites an existing review state rather than duplicating it", async () => {
    const first = initialReviewState("rep-a", "pos-1", Date.parse("2026-01-01"));
    await saveReviewStates([first]);
    await saveReviewStates([{ ...first, reps: 3, intervalDays: 7 }]);
    const stored = await listAllReviewStates();
    expect(stored).toHaveLength(1);
    expect(stored[0].reps).toBe(3);
  });

  it("deletes a repertoire's review state along with the repertoire", async () => {
    const graph = importPgn("1. e4 e5 *", "white").graph;
    await saveRepertoire({ id: "rep-gone", name: "Gone", traineeColor: "white", graph, createdAt: "2026-01-01", updatedAt: "2026-01-01", revision: 1 });
    await saveReviewStates([initialReviewState("rep-gone", "pos-1"), initialReviewState("rep-kept", "pos-2")]);
    await deleteRepertoire("rep-gone");
    expect((await listAllReviewStates()).map((state) => state.repertoireId)).toEqual(["rep-kept"]);
  });

  it("migrates a v1 database (repertoires, sessions, outbox) forward: outbox is dropped, learning is added, existing data survives", async () => {
    await resetDatabase();
    const legacy = await openDB("out-of-book", 1, {
      upgrade(db) {
        db.createObjectStore("repertoires", { keyPath: "id" });
        const sessions = db.createObjectStore("sessions", { keyPath: "id" });
        sessions.createIndex("by-updated", "updatedAt");
        db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
      },
    });
    const graph = importPgn("1. e4 e5 *", "white").graph;
    await legacy.put("repertoires", { id: "legacy-rep", name: "Legacy", traineeColor: "white", graph, createdAt: "2026-01-01", updatedAt: "2026-01-01", revision: 1 });
    await legacy.put("outbox", { type: "old-sync-event", payload: {}, createdAt: "2026-01-01" });
    legacy.close();

    const repertoires = await listRepertoires();
    expect(repertoires.map((item) => item.id)).toContain("legacy-rep");

    const upgraded = await openDB("out-of-book", 2);
    expect(upgraded.objectStoreNames.contains("outbox")).toBe(false);
    expect(upgraded.objectStoreNames.contains("learning")).toBe(true);
    upgraded.close();
  });
});
