import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRepertoireLibrary } from "@/components/use-repertoire-library";
import { initialReviewState } from "@/lib/chess/scheduling";
import { createTrainingSession } from "@/lib/chess/training-machine";
import { START_FEN } from "@/lib/chess/rules";
import {
  listAllReviewStates,
  listRepertoires,
  saveRepertoire,
  saveSession,
} from "@/lib/storage/guest-store";
import { resetDatabase } from "./helpers/database";
import { repertoireFixture } from "./helpers/fixtures";

afterEach(resetDatabase);

function renderLibrary(onResume = vi.fn()) {
  const view = renderHook(() => useRepertoireLibrary(onResume));
  return { ...view, onResume };
}

describe("useRepertoireLibrary", () => {
  it("loads saved repertoires newest first and clears the loading state", async () => {
    await saveRepertoire(repertoireFixture("1. e4 *", { id: "older", name: "Older", updatedAt: "2026-01-01T00:00:00.000Z" }));
    await saveRepertoire(repertoireFixture("1. d4 *", { id: "newer", name: "Newer", updatedAt: "2026-06-01T00:00:00.000Z" }));

    const { result } = renderLibrary();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.repertoires.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(result.current.error).toBeUndefined();
  });

  it("hands back an unfinished drill for the repertoire it belongs to", async () => {
    await saveRepertoire(repertoireFixture("1. e4 e5 *", { id: "rep-live" }));
    const session = createTrainingSession({
      repertoireId: "rep-live",
      traineeColor: "white",
      rootFen: START_FEN,
      strength: 1400,
      deviationFrequency: "never",
      plannedDeviationPly: null,
    });
    await saveSession(session);

    const { result, onResume } = renderLibrary();
    await waitFor(() => expect(onResume).toHaveBeenCalledTimes(1));
    expect(onResume.mock.calls[0][0].id).toBe(session.id);
    expect(result.current.loading).toBe(false);
  });

  it("ignores a saved drill whose repertoire has since been deleted", async () => {
    await saveSession(createTrainingSession({
      repertoireId: "rep-vanished",
      traineeColor: "white",
      rootFen: START_FEN,
      strength: 1400,
      deviationFrequency: "never",
      plannedDeviationPly: null,
    }));

    const { result, onResume } = renderLibrary();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(onResume).not.toHaveBeenCalled();
  });

  it("creates a repertoire that is both listed and stored", async () => {
    const { result } = renderLibrary();
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => {
      created = await result.current.create();
    });

    expect(result.current.repertoires.map((item) => item.id)).toEqual([created.id]);
    expect((await listRepertoires()).map((item) => item.id)).toEqual([created.id]);
  });

  it("revises a repertoire in place, bumping its revision and keeping the list sorted", async () => {
    await saveRepertoire(repertoireFixture("1. e4 *", { id: "rep-a", updatedAt: "2026-01-01T00:00:00.000Z" }));
    await saveRepertoire(repertoireFixture("1. d4 *", { id: "rep-b", updatedAt: "2026-06-01T00:00:00.000Z" }));

    const { result } = renderLibrary();
    await waitFor(() => expect(result.current.repertoires).toHaveLength(2));

    const older = result.current.repertoires.find((item) => item.id === "rep-a")!;
    await act(async () => {
      await result.current.revise(older, { name: "Renamed" });
    });

    expect(result.current.repertoires[0]).toMatchObject({ id: "rep-a", name: "Renamed", revision: older.revision + 1 });
    const stored = (await listRepertoires()).find((item) => item.id === "rep-a");
    expect(stored?.name).toBe("Renamed");
  });

  it("removes a repertoire and its review schedule together", async () => {
    await saveRepertoire(repertoireFixture("1. e4 *", { id: "rep-gone" }));
    const { result } = renderLibrary();
    await waitFor(() => expect(result.current.repertoires).toHaveLength(1));

    await act(async () => {
      result.current.recordReviewStates([initialReviewState("rep-gone", "pos-1")]);
    });
    await waitFor(() => expect(result.current.reviewStates).toHaveLength(1));

    let removed = false;
    await act(async () => {
      removed = await result.current.remove("rep-gone");
    });

    expect(removed).toBe(true);
    expect(result.current.repertoires).toHaveLength(0);
    expect(result.current.reviewStates).toHaveLength(0);
    expect(await listAllReviewStates()).toHaveLength(0);
  });

  it("replaces a decision's review state instead of accumulating duplicates", async () => {
    const { result } = renderLibrary();
    await waitFor(() => expect(result.current.loading).toBe(false));

    const first = initialReviewState("rep-a", "pos-1", Date.parse("2026-01-01"));
    await act(async () => {
      result.current.recordReviewStates([first]);
    });
    await act(async () => {
      result.current.recordReviewStates([{ ...first, reps: 2 }]);
    });

    await waitFor(() => expect(result.current.reviewStates).toHaveLength(1));
    expect(result.current.reviewStates[0].reps).toBe(2);
    await waitFor(async () => expect(await listAllReviewStates()).toHaveLength(1));
  });

  it("surfaces a dismissible message when the store cannot be read", async () => {
    const failure = vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    const { result } = renderLibrary();
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.loading).toBe(false);

    failure.mockRestore();
    act(() => result.current.dismissError());
    expect(result.current.error).toBeUndefined();
  });
});
