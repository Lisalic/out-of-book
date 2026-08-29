import { Chess } from "chess.js";
import { openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
import { importPgn } from "@/lib/chess/pgn";
import { initialReviewState } from "@/lib/chess/scheduling";
import { createTrainingSession } from "@/lib/chess/training-machine";
import {
  deleteRepertoire,
  getLatestActiveSession,
  listAllReviewStates,
  listRepertoires,
  listReviewStates,
  resetDatabaseHandleForTests,
  saveRepertoire,
  saveReviewState,
  saveSession,
} from "@/lib/storage/guest-store";

afterEach(async () => {
  await resetDatabaseHandleForTests();
  await deleteDatabase("out-of-book");
});

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

  it("stores and lists spaced-repetition review state per repertoire", async () => {
    const state = initialReviewState("rep-a", "pos-1", Date.parse("2026-01-01"));
    await saveReviewState(state);
    await saveReviewState(initialReviewState("rep-b", "pos-2", Date.parse("2026-01-01")));
    expect(await listReviewStates("rep-a")).toEqual([state]);
    expect(await listAllReviewStates()).toHaveLength(2);
  });

  it("deletes a repertoire's review state along with the repertoire", async () => {
    const graph = importPgn("1. e4 e5 *", "white").graph;
    await saveRepertoire({ id: "rep-gone", name: "Gone", traineeColor: "white", graph, createdAt: "2026-01-01", updatedAt: "2026-01-01", revision: 1 });
    await saveReviewState(initialReviewState("rep-gone", "pos-1"));
    await deleteRepertoire("rep-gone");
    expect(await listReviewStates("rep-gone")).toHaveLength(0);
  });

  it("migrates a v1 database (repertoires, sessions, outbox) forward: outbox is dropped, learning is added, existing data survives", async () => {
    await resetDatabaseHandleForTests();
    await deleteDatabase("out-of-book");
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
