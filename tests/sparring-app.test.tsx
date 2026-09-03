import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SparringApp } from "@/components/sparring-app";
import { createTrainingSession } from "@/lib/chess/training-machine";
import { START_FEN } from "@/lib/chess/rules";
import { saveRepertoire, saveSession, listRepertoires } from "@/lib/storage/guest-store";
import { resetDatabase } from "./helpers/database";
import { repertoireFixture } from "./helpers/fixtures";

afterEach(async () => {
  vi.restoreAllMocks();
  await resetDatabase();
});

const PGN = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *";

/** Walks the first-run flow up to a saved repertoire holding the given PGN. */
async function importRepertoire(pgn = PGN) {
  render(<SparringApp />);
  fireEvent.click(await screen.findByRole("button", { name: "Import a PGN" }));
  const textarea = await screen.findByLabelText("PGN text");
  fireEvent.change(textarea, { target: { value: pgn } });
  fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add to repertoire" }));
  await waitFor(() => expect(screen.getByLabelText("Repertoire move list")).toBeVisible());
}

describe("SparringApp", () => {
  async function openPractice() {
    fireEvent.click(await screen.findByRole("button", { name: "Practise" }));
    fireEvent.click(screen.getByRole("button", { name: "Openings" }));
  }

  it("shows a freshly created repertoire in the editor immediately — regression test for a state/storage desync", async () => {
    render(<SparringApp />);

    // First-run hero, since there are no repertoires yet — this now opens the editor directly.
    fireEvent.click(await screen.findByRole("button", { name: "Build on the board" }));

    // The freshly created repertoire must appear in the editor without a reload — this
    // previously failed because persistRepertoire used Array.map to update the in-memory
    // repertoire list, which is a no-op for a repertoire that isn't in that list yet.
    await waitFor(() => {
      expect(screen.getByDisplayValue("Untitled repertoire")).toBeVisible();
    });
  });

  it("imports a PGN into a new repertoire and saves it", async () => {
    await importRepertoire();

    const moves = screen.getByLabelText("Repertoire move list");
    expect(within(moves).getByRole("button", { name: "Go to e4" })).toBeVisible();

    const stored = await listRepertoires();
    expect(stored).toHaveLength(1);
    expect(Object.keys(stored[0].graph.edges).length).toBeGreaterThan(4);
  });

  it("renames a repertoire and keeps the change after leaving the editor", async () => {
    await importRepertoire();

    const name = screen.getByLabelText("Repertoire name");
    fireEvent.change(name, { target: { value: "Ruy Lopez" } });
    fireEvent.blur(name);

    await waitFor(async () => expect((await listRepertoires())[0].name).toBe("Ruy Lopez"));
    fireEvent.click(screen.getByRole("button", { name: "← Repertoires" }));
    expect(await screen.findByText("Ruy Lopez")).toBeVisible();
  });

  it("switches the book's side, re-labelling which moves are the trainee's", async () => {
    await importRepertoire();
    fireEvent.click(screen.getByRole("button", { name: "black" }));

    await waitFor(async () => {
      const [stored] = await listRepertoires();
      expect(stored.traineeColor).toBe("black");
      const accepted = Object.values(stored.graph.edges).filter((edge) => edge.isAccepted).map((edge) => edge.san);
      expect(accepted).toContain("e5");
      expect(accepted).not.toContain("e4");
    });
  });

  it("carries a repertoire through setup into a live drill", async () => {
    await importRepertoire();
    fireEvent.click(screen.getByRole("button", { name: "← Repertoires" }));
    fireEvent.click(await screen.findByRole("button", { name: "Practise" }));

    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    expect(await screen.findByText("HOW HARD SHOULD THIS BE?")).toBeVisible();
    expect(screen.getByText("Lines in book").nextElementSibling).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: /Never/ }));
    fireEvent.click(screen.getByRole("button", { name: /Start session/ }));

    expect(await screen.findByText("Line 1/1")).toBeVisible();
    expect(screen.getByText("Your move")).toBeVisible();
  });

  it("resumes an unfinished drill from the dashboard", async () => {
    const repertoire = repertoireFixture(PGN, { id: "rep-resume", name: "Paused book" });
    await saveRepertoire(repertoire);
    await saveSession(createTrainingSession({
      repertoireId: repertoire.id,
      traineeColor: "white",
      rootFen: START_FEN,
      strength: 1400,
      deviationFrequency: "never",
      plannedDeviationPly: null,
      drill: { lines: [{ id: "line-1", decisionKeys: [], edgeUcis: [] }], currentLineIndex: 0, completedLines: [], deviationChance: 0 },
    }));

    render(<SparringApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Paused drill/ }));
    expect(await screen.findByText("Line 1/1")).toBeVisible();
    expect(screen.getByText("Paused book — white")).toBeVisible();
  });

  it("deletes a repertoire only after it is confirmed", async () => {
    await saveRepertoire(repertoireFixture(PGN, { id: "rep-doomed", name: "Doomed" }));
    render(<SparringApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Repertoires" }));
    await screen.findByText("Doomed");

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "×" }));
    expect(await listRepertoires()).toHaveLength(1);

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "×" }));
    // The list is emptied on screen and in the store; the state update lands after the write.
    expect(await screen.findByText("Create your first repertoire")).toBeVisible();
    expect(await listRepertoires()).toHaveLength(0);
  });

  it("reports a storage failure without losing the screen", async () => {
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    render(<SparringApp />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not be loaded/i);
    fireEvent.click(within(alert).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("saves a move played on the editor board, and follows it a second time without duplicating it", async () => {
    render(<SparringApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Build on the board" }));
    await screen.findByLabelText("Repertoire name");

    const square = (name: string) => document.querySelector(`[data-square="${name}"]`)!;
    fireEvent.click(square("e2"));
    fireEvent.click(square("e4"));

    await waitFor(async () => {
      const [stored] = await listRepertoires();
      expect(Object.values(stored.graph.edges).map((edge) => edge.san)).toEqual(["e4"]);
    });
    expect(within(screen.getByLabelText("Repertoire move list")).getByRole("button", { name: "Go to e4" })).toBeVisible();

    // Back to the start and play the same move again: it is followed, not saved twice.
    fireEvent.click(screen.getByRole("button", { name: "Start position" }));
    fireEvent.click(square("e2"));
    fireEvent.click(square("e4"));

    await waitFor(async () => {
      const [stored] = await listRepertoires();
      expect(Object.keys(stored.graph.edges)).toHaveLength(1);
    });
  });

  it("creates and persists a White preset before opening practice setup", async () => {
    render(<SparringApp />);
    await openPractice();

    fireEvent.click(screen.getByRole("button", { name: /italian game.*rapid development/i }));

    expect(await screen.findByText("HOW HARD SHOULD THIS BE?")).toBeVisible();
    expect(screen.getByText("white")).toBeVisible();
    await waitFor(async () => {
      expect(await listRepertoires()).toEqual([
        expect.objectContaining({ sourcePresetId: "italian-game", traineeColor: "white" }),
      ]);
    });
  });

  it("reopens an existing preset instead of creating a duplicate", async () => {
    render(<SparringApp />);
    await openPractice();
    fireEvent.click(screen.getByRole("button", { name: /italian game.*rapid development/i }));
    fireEvent.click(await screen.findByRole("button", { name: /back to books/i }));

    fireEvent.click(screen.getByRole("button", { name: "Openings" }));
    expect(screen.getByText("In your books")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /italian game.*rapid development/i }));

    expect(await screen.findByText("HOW HARD SHOULD THIS BE?")).toBeVisible();
    await waitFor(async () => expect(await listRepertoires()).toHaveLength(1));
  });

  it("remembers Black across picker opens and creates a Black repertoire", async () => {
    render(<SparringApp />);
    await openPractice();
    fireEvent.click(screen.getByRole("button", { name: "Black" }));
    fireEvent.click(screen.getByRole("button", { name: /french defence.*resilient pawn chain/i }));

    expect(await screen.findByText("black")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /back to books/i }));
    fireEvent.click(screen.getByRole("button", { name: "Openings" }));
    expect(screen.getByRole("button", { name: "Black" })).toHaveAttribute("aria-pressed", "true");
    expect(await listRepertoires()).toEqual([
      expect.objectContaining({ sourcePresetId: "french-defence", traineeColor: "black" }),
    ]);
  });

  it("stops treating an edited preset as the same preset after its side changes", async () => {
    render(<SparringApp />);
    await openPractice();
    fireEvent.click(screen.getByRole("button", { name: /italian game.*rapid development/i }));
    fireEvent.click(await screen.findByRole("button", { name: /back to books/i }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "black" }));
    fireEvent.click(screen.getByRole("button", { name: /repertoires/i }));
    fireEvent.click(screen.getByRole("button", { name: "Practise" }));
    fireEvent.click(screen.getByRole("button", { name: "Openings" }));
    fireEvent.click(screen.getByRole("button", { name: "Black" }));

    expect(screen.queryByText("In your books")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /italian game.*rapid development/i }));

    await waitFor(async () => {
      const saved = await listRepertoires();
      expect(saved).toHaveLength(2);
      expect(saved.filter((item) => item.sourcePresetId === "italian-game")).toHaveLength(1);
    });
  });
});
