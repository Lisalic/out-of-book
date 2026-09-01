import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OpeningPicker } from "@/components/opening-picker";
import { importPgn } from "@/lib/chess/pgn";
import type { OpeningPreset } from "@/lib/chess/opening-presets";
import type { Repertoire, TraineeColor } from "@/lib/chess/types";

function savedPreset(): Repertoire {
  return {
    id: "saved-sicilian",
    name: "My Sicilian",
    traineeColor: "black",
    sourcePresetId: "sicilian-defence",
    graph: importPgn("e4 c5 *", "black").graph,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    revision: 1,
  };
}

function Harness({ onSelect = vi.fn() }: { onSelect?: (preset: OpeningPreset) => void }) {
  const [side, setSide] = useState<TraineeColor>("white");
  return <OpeningPicker repertoires={[savedPreset()]} side={side} onSideChange={setSide} onSelect={onSelect} />;
}

describe("OpeningPicker", () => {
  it("reactively searches opening metadata and key moves", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Openings" }));

    expect(screen.getByText("12 openings")).toBeVisible();
    const italian = screen.getByRole("button", { name: /italian game.*rapid development/i });
    expect(italian).toBeVisible();
    expect(italian).toHaveAccessibleName(/rapid development aimed at the vulnerable f7-square/i);
    expect(within(italian).getByText("e4 e5 Nf3 Nc6 …")).toBeInTheDocument();
    expect(within(italian).getByText("e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search openings" }), { target: { value: "Spanish" } });
    expect(screen.getByText("1 opening")).toBeVisible();
    expect(screen.getByRole("button", { name: /ruy lopez/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /italian game/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search openings" }), { target: { value: "moon" } });
    expect(screen.getByText("No openings match “moon”.")).toBeVisible();
  });

  it("marks saved books for the selected side and returns focus on Escape", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const trigger = screen.getByRole("button", { name: "Openings" });
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("button", { name: "Black" }));
    expect(screen.getByText("In your books")).toBeVisible();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    const sicilian = screen.getByRole("button", { name: /sicilian defence.*black creates/i });
    sicilian.focus();
    fireEvent.click(sicilian);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "sicilian-defence" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("stays open for inside pointerdown and closes for outside pointerdown", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Openings" });
    fireEvent.click(trigger);

    fireEvent.pointerDown(screen.getByRole("searchbox", { name: "Search openings" }));
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("disables the trigger while a preset selection is pending", async () => {
    let finish!: () => void;
    const onSelect = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<Harness onSelect={onSelect} />);
    const trigger = screen.getByRole("button", { name: "Openings" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /italian game.*rapid development/i }));

    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("aria-busy", "true");

    finish();
    await waitFor(() => expect(trigger).toBeEnabled());
  });
});
