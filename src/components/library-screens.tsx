"use client";

import { useMemo, useState } from "react";
import { Chessboard } from "./chessboard";
import { OpeningPicker } from "./opening-picker";
import { SoundToggle } from "./board-sound";
import type { OpeningPreset } from "@/lib/chess/opening-presets";
import { decisionPositions, dueLineCount, repertoireLines } from "@/lib/chess/scheduling";
import type { Repertoire, ReviewState, TrainingSession, TraineeColor } from "@/lib/chess/types";

export interface RepertoireStats {
  decisions: number;
  lines: number;
  coverage: number;
  due: number;
}

function repertoireStats(repertoire: Repertoire, states: ReviewState[]): RepertoireStats {
  const decisions = decisionPositions(repertoire.graph, repertoire.traineeColor);
  const lines = repertoireLines(repertoire.graph, repertoire.traineeColor);
  const repStates = states.filter((state) => state.repertoireId === repertoire.id);
  const reviewed = repStates.filter((state) => decisions.includes(state.positionKey)).length;
  return {
    decisions: decisions.length,
    lines: lines.length,
    coverage: decisions.length ? Math.round((reviewed / decisions.length) * 100) : 0,
    due: dueLineCount(lines, new Map(repStates.map((state) => [state.positionKey, state]))),
  };
}

interface RepertoireRow {
  repertoire: Repertoire;
  stats: RepertoireStats;
}

/**
 * Stats are two graph traversals per repertoire, so they are computed once per list rather
 * than inside each row's render.
 */
function useRepertoireRows(repertoires: Repertoire[], reviewStates: ReviewState[]): RepertoireRow[] {
  return useMemo(
    () => repertoires.map((repertoire) => ({ repertoire, stats: repertoireStats(repertoire, reviewStates) })),
    [repertoires, reviewStates],
  );
}

function SideChip({ color, size = "md" }: { color: Repertoire["traineeColor"]; size?: "md" | "lg" }) {
  const dimension = size === "lg" ? "h-13 w-13 text-3xl" : "h-11 w-11 text-2xl";
  return (
    <span
      className={`grid flex-none place-items-center ${dimension} ${color === "white" ? "bg-ink text-canvas" : "bg-line text-ink"}`}
      aria-label={`Play as ${color}`}
    >
      {color === "white" ? "♙" : "♟"}
    </span>
  );
}

function CoverageBar({ percent }: { percent: number }) {
  return (
    <div>
      <div className="relative h-2 bg-line">
        <i className="absolute inset-y-0 left-0 block bg-accent" style={{ width: `${percent}%` }} />
      </div>
      <p className="mono mt-1.5 text-[10px] text-ink-faint">{percent}% learned</p>
    </div>
  );
}

interface RepertoireRowProps extends RepertoireRow {
  actions: React.ReactNode;
}

function RepertoireRow({ repertoire, stats, actions }: RepertoireRowProps) {
  return (
    <div className="panel grid grid-cols-1 items-center gap-4 p-5 sm:grid-cols-[56px_1fr_150px_90px_auto] sm:gap-6">
      <SideChip color={repertoire.traineeColor} />
      <div className="min-w-0">
        <p className="truncate text-xl font-semibold tracking-tight">{repertoire.name}</p>
        <p className="mono mt-1 text-[11px] text-ink-muted">{stats.lines} line{stats.lines === 1 ? "" : "s"}</p>
      </div>
      <CoverageBar percent={stats.coverage} />
      <p className={`mono text-base font-bold ${stats.due > 0 ? "text-accent" : "text-ink-faint"}`}>{stats.due > 0 ? stats.due : "—"}</p>
      <div className="flex gap-0.5">{actions}</div>
    </div>
  );
}

function EmptyPanel({ icon, title, detail, action }: { icon: string; title: string; detail: string; action: React.ReactNode }) {
  return (
    <div className="panel grid min-h-72 place-items-center gap-3 p-8 text-center">
      <span className="text-4xl text-ink-dim" aria-hidden="true">{icon}</span>
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      {detail && <p className="max-w-sm text-ink-muted">{detail}</p>}
      {action}
    </div>
  );
}

function PageHeading({ kicker, title, detail, action }: { kicker?: string; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
      <div className="max-w-2xl">
        {kicker && <p className="eyebrow">{kicker}</p>}
        <h1 className="mt-3 text-[52px] leading-[0.92] font-bold tracking-tighter text-balance sm:text-[64px]">{title}</h1>
        {detail && <p className="mt-4 text-lg text-ink-muted text-pretty">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

/** A quiet, non-interactive book position — the first-run hero's only image. Ruy Lopez after 3. Bb5. */
const HERO_FEN = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";

/** Shown in place of a bare empty state on the very first visit — no repertoires exist yet anywhere. */
function FirstRunHero({ onImport, onBuild }: { onImport: () => void; onBuild: () => void }) {
  return (
    <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_minmax(0,400px)] lg:gap-16">
      <div>
        <h1 className="text-[44px] leading-[0.95] font-bold tracking-tighter text-balance sm:text-[64px]">
          Start a repertoire.
        </h1>
        <p className="mt-5 max-w-[32ch] text-lg leading-relaxed text-ink-muted text-pretty">
          Import a PGN, or build one move by move.
        </p>
        <div className="mt-9 flex flex-wrap gap-0.5">
          <button type="button" className="btn btn-primary px-8 py-5 text-sm" onClick={onImport}>Import a PGN</button>
          <button type="button" className="btn px-8 py-5 text-sm" onClick={onBuild}>Build on the board</button>
        </div>
      </div>
      <div className="relative w-full max-w-[400px] justify-self-center lg:justify-self-end">
        <div aria-hidden="true"><Chessboard fen={HERO_FEN} interactive={false} /></div>
        <SoundToggle className="absolute right-2 bottom-2 z-10 grid size-10 cursor-pointer place-items-center bg-canvas hover:bg-line" />
      </div>
    </div>
  );
}

interface HomeScreenProps {
  repertoires: Repertoire[];
  reviewStates: ReviewState[];
  session?: TrainingSession;
  onPractice: () => void;
  onManage: () => void;
  onResume: () => void;
  onEdit: (id: string) => void;
  onCreate: (tab: "moves" | "import") => void;
}

export function HomeScreen({ repertoires, reviewStates, session, onPractice, onManage, onResume, onEdit, onCreate }: HomeScreenProps) {
  const activeRepertoire = session && repertoires.find((item) => item.id === session.repertoireId);
  // Due-date math only needs day-granularity freshness; a "now" fixed at mount avoids
  // calling Date.now() during render while staying accurate for the life of this screen.
  const [now] = useState(() => Date.now());
  const rows = useRepertoireRows(repertoires, reviewStates);
  const totalDue = useMemo(() => rows.reduce((sum, row) => sum + row.stats.due, 0), [rows]);
  const totalLines = useMemo(() => rows.reduce((sum, row) => sum + row.stats.lines, 0), [rows]);
  const dateLabel = useMemo(() => new Date(now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }), [now]);
  const reviewedAnywhere = reviewStates.length > 0;
  const cleanRecallPercent = reviewedAnywhere
    ? Math.round((reviewStates.filter((state) => state.lapses === 0).length / reviewStates.length) * 100)
    : null;

  if (repertoires.length === 0) {
    return (
      <section className="mx-auto flex w-[min(1180px,calc(100%-56px))] flex-1 items-center py-16">
        <FirstRunHero onImport={() => onCreate("import")} onBuild={() => onCreate("moves")} />
      </section>
    );
  }

  return (
    <section className="mx-auto w-[min(1180px,calc(100%-56px))] flex-1 py-11">
      <div className="animate-band-drop mb-0.5 flex flex-col items-start justify-between gap-6 bg-accent p-9 text-accent-ink sm:flex-row sm:items-center">
        <div>
          <p className="mono text-xs font-bold tracking-[0.18em] uppercase">{dateLabel} · queue ready</p>
          <div className="mt-2 flex items-baseline gap-5">
            <span className="text-[88px] leading-[0.85] font-bold tracking-tighter">{totalDue}</span>
            <span className="text-2xl leading-tight font-semibold">
              line{totalDue === 1 ? "" : "s"} due
              <br />
              across {repertoires.length} repertoire{repertoires.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <button type="button" onClick={onPractice} className="mono bg-canvas px-8 py-5 text-sm font-bold whitespace-nowrap text-accent">
          START REVIEW →
        </button>
      </div>

      <div className="grid grid-cols-1 gap-0.5 lg:grid-cols-[1fr_320px]">
        <div className="panel p-9">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-sm font-bold tracking-[0.14em] uppercase">Repertoires</h2>
            <p className="mono text-[11px] text-ink-faint">{totalLines} line{totalLines === 1 ? "" : "s"}</p>
          </div>
          <div className="mt-4.5 flex flex-col gap-0.5">
            {rows.slice(0, 4).map(({ repertoire, stats }) => (
              <RepertoireRow
                key={repertoire.id}
                repertoire={repertoire}
                stats={stats}
                actions={<button type="button" className="btn btn-primary px-6" onClick={() => onEdit(repertoire.id)}>Edit</button>}
              />
            ))}
          </div>
          <div className="mt-0.5 flex gap-0.5">
            <button type="button" className="btn flex-1 justify-start px-5.5 py-4.5 text-accent" onClick={onManage}>+ New repertoire</button>
            <button type="button" className="btn flex-1 justify-start px-5.5 py-4.5" onClick={onManage}>Import PGN</button>
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          {activeRepertoire && session?.phase !== "review" && (
            <button type="button" onClick={onResume} className="panel p-6.5 text-left">
              <p className="label">Paused drill</p>
              <p className="mt-3 text-xl font-semibold tracking-tight capitalize">
                {activeRepertoire.name}
                <br />— {activeRepertoire.traineeColor}
              </p>
              <p className="mono mt-2 text-[11px] text-ink-muted">
                Line {(session.drill?.currentLineIndex ?? 0) + 1} / {session.drill?.lines.length ?? 1}
              </p>
              <p className="mono mt-4.5 text-xs font-bold text-accent">Resume →</p>
            </button>
          )}
          <div className="panel flex-1 p-6.5">
            <p className="label">Recall · all time</p>
            <p className="mt-3 text-[56px] leading-[0.88] font-bold tracking-tighter">
              {cleanRecallPercent === null ? "—" : (
                <>
                  {cleanRecallPercent}
                  <span className="text-3xl">%</span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

interface PracticeLibraryProps {
  repertoires: Repertoire[];
  reviewStates: ReviewState[];
  presetSide: TraineeColor;
  onPresetSideChange: (side: TraineeColor) => void;
  onPresetSelect: (preset: OpeningPreset) => void | Promise<void>;
  onPractice: (id: string) => void;
  onEdit: (id: string) => void;
  onManage: () => void;
}

export function PracticeLibrary({
  repertoires,
  reviewStates,
  presetSide,
  onPresetSideChange,
  onPresetSelect,
  onPractice,
  onEdit,
  onManage,
}: PracticeLibraryProps) {
  const rows = useRepertoireRows(repertoires, reviewStates);
  return (
    <section className="mx-auto w-[min(1180px,calc(100%-56px))] flex-1 py-11">
      <PageHeading
        title="WHAT ARE WE DRILLING?"
        detail=""
        action={<OpeningPicker repertoires={repertoires} side={presetSide} onSideChange={onPresetSideChange} onSelect={onPresetSelect} />}
      />
      {repertoires.length === 0 ? (
        <EmptyPanel
          icon="♟"
          title="No repertoires yet"
          detail=""
          action={<button type="button" className="btn btn-primary" onClick={onManage}>Create repertoire</button>}
        />
      ) : (
        <div className="flex flex-col gap-0.5">
          {rows.map(({ repertoire, stats }) => {
            const ready = stats.decisions > 0;
            return (
              <RepertoireRow
                key={repertoire.id}
                repertoire={repertoire}
                stats={stats}
                actions={
                  <>
                    <button type="button" className="btn" onClick={() => onEdit(repertoire.id)}>Edit</button>
                    <button type="button" className="btn btn-primary" onClick={() => (ready ? onPractice(repertoire.id) : onEdit(repertoire.id))}>
                      {ready ? "Start" : "Add lines"}
                    </button>
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

interface RepertoireManagerProps {
  repertoires: Repertoire[];
  reviewStates: ReviewState[];
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function RepertoireManager({ repertoires, reviewStates, onCreate, onEdit, onDelete }: RepertoireManagerProps) {
  const rows = useRepertoireRows(repertoires, reviewStates);
  return (
    <section className="mx-auto w-[min(1180px,calc(100%-56px))] flex-1 py-11">
      <PageHeading
        kicker="Your books"
        title="REPERTOIRES"
        detail=""
        action={<button type="button" className="btn btn-primary px-6.5 py-5" onClick={onCreate}>New book</button>}
      />
      {repertoires.length === 0 ? (
        <EmptyPanel
          icon="＋"
          title="Create your first repertoire"
          detail=""
          action={<button type="button" className="btn btn-primary" onClick={onCreate}>New book</button>}
        />
      ) : (
        <div className="flex flex-col gap-0.5">
          {rows.map(({ repertoire, stats }) => (
            <RepertoireRow
              key={repertoire.id}
              repertoire={repertoire}
              stats={stats}
              actions={
                <>
                  <button type="button" className="btn" onClick={() => onEdit(repertoire.id)}>Edit</button>
                  <button type="button" className="btn btn-danger" onClick={() => onDelete(repertoire.id)}>×</button>
                </>
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
