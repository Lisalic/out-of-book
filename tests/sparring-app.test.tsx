import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SparringApp } from "@/components/sparring-app";
import { listRepertoires, resetDatabaseHandleForTests } from "@/lib/storage/guest-store";

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

afterEach(async () => {
  await resetDatabaseHandleForTests();
  await deleteDatabase("out-of-book");
});

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
