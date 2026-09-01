import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SparringApp } from "@/components/sparring-app";
import { resetDatabaseHandleForTests } from "@/lib/storage/guest-store";

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
});
