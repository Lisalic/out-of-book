# Niche Analysis and Extension Avenues

Status: analysis of the shipped prototype plus a ranked list of in-niche extensions
Companion to: `PRODUCT_PLAN.md` (the forward-looking product/technical plan)
Last updated: 2026-08-31

---

## 1. The niche as currently built

### 1.1 One-sentence definition

**The app owns the seam between opening memorization and real play: the moment your opponent
leaves your preparation, and everything you have to do on your own after that.**

Everything shipped serves that seam. A repertoire is drilled (`src/lib/chess/scheduling.ts`),
an opponent follows it (`src/lib/chess/training-machine.ts`), a planned deviation drops the
trainee out of book at a position at-or-after the one being tested
(`src/lib/chess/drill.ts:planLineDeviation`), and a strength-limited engine takes over
(`src/lib/chess/engine-strength.ts`). Review reports recall and resulting evaluation as two
separate numbers (`src/components/review-screen.tsx`).

### 1.2 What the niche is *not*

The niche is deliberately narrow on three sides, and each boundary is load-bearing:

| Adjacent category | Who owns it | Why this app must not drift there |
|---|---|---|
| Opening memorization / flashcards | Chessable, Listudy, Chess Position Trainer | Drilling is the *setup* for the seam, not the product. Winning on drill features alone means competing on library size and spaced-repetition science. |
| Playing engines from a position | Lichess, Chess.com, any GUI | Playing an engine is the *payoff*, not the product. Winning there means competing on engine strength, ratings, and time controls. |
| Opening knowledge itself | Explorers, master databases, video courses | The repertoire is **personal truth** (Principle 1). The moment the app becomes an authority on "the right move," it inherits a content business and loses the "not in your repertoire ≠ blunder" distinction. |

The differentiator is the *transition*, not either side of it. Every extension below is judged
on whether it makes the transition better, or removes friction on the path to it.

### 1.3 What is actually implemented today

A local-first single-page app at `/` with seven client-state screens and IndexedDB as the only
store (`src/lib/storage/guest-store.ts`). No accounts, no server, no sync.

- **Repertoire as a position graph** with transposition merging, soft-deleted edges, multiple
  accepted moves, comments and NAGs (`src/lib/chess/graph.ts`, `src/lib/chess/types.ts`).
- **PGN import with preview + conflict counts, and PGN export** (`src/lib/chess/pgn.ts`,
  `src/lib/chess/pgn-export.ts`, `src/components/repertoire-editor.tsx`).
- **Spaced repetition over decision positions** — SM-2-lite, three grades, due/fresh/weak
  session selection (`src/lib/chess/scheduling.ts`).
- **Deviation planning and plausible off-book sampling** — MultiPV candidates filtered by an
  eval-loss cap that widens at lower strengths, then temperature-weighted sampling
  (`src/lib/chess/deviation.ts`).
- **Engine continuation** via Lozza (MIT, pure JS, NNUE) in a Web Worker, with approximate
  strength simulated in-app because Lozza has no `UCI_LimitStrength`
  (`src/lib/chess/engine-adapter.ts`, `src/lib/chess/engine-strength.ts`, 200–2000 range).
- **Split review** — first-try recall rate and mean end-of-line evaluation, plus next-review
  dates (`src/components/review-screen.tsx`).

Notable gaps that several avenues below build on: no tags/chapters, no mixed review across
repertoires, no hints, no per-move centipawn loss, no scheduling of post-book positions, and
review rows are labelled "Position 1…N" with no opening identity.

---

## 2. The focus test

Before adding anything, run it through these four questions. **A "no" on any one of them means
the idea belongs in a different product, however good it is.**

1. **Seam test.** Does it improve the transition — making deviations more realistic, the
   trainee better prepared for them, or the lesson from them clearer? Or does it remove
   friction on the path to a drill?
2. **Personal-truth test.** Does it keep the user's repertoire as the source of truth, and keep
   "not in your repertoire" distinct from "bad move"?
3. **Session test.** Does a useful unit still complete in 3–10 minutes, with the board as the
   main interface (Principle 3 and 4)?
4. **Cost test.** Does inference stay on the device, so marginal cost per session stays ~zero
   (Principle 6)?

A fifth, softer test is worth applying to anything large: **would a competitor's existing
strength make this a losing fight?** Building an opening explorer means fighting Lichess;
building a better SM-2 means fighting Chessable. Building "what happens after they deviate"
means fighting nobody.

---

## 3. Extension avenues

Ranked by how directly each strengthens the seam, with the least defensible listed last.
"Depends on" names the code the work would extend.

### Tier A — Deepen the seam itself

This is the core differentiator and the least contested ground. Everything here is work no
competitor is doing, because no competitor's product is organized around the transition.

#### A1. Human-plausible deviations, not just engine-plausible ones
Today a deviation is sampled from MultiPV candidates by evaluation loss
(`src/lib/chess/deviation.ts`). That yields *reasonable* moves, but humans deviate in
characteristic, non-uniform ways — the popular sideline, the natural-looking developing move,
the premature attack. Blend an open, permissively licensed move-frequency source (the Lichess
open database is CC0) into candidate weighting, keyed by position and rating band.

- **Why it's in-niche:** it is Principle 2 ("surprises must be plausible") taken seriously, and
  the plan already flags this as the realism upgrade (§5.5).
- **Watch the boundary:** ship it as a *weighting input* to deviation selection only. The moment
  it becomes a browsable explorer screen, the app has entered the database business.
- **Depends on:** `deviation.ts`, `engine-strength.ts:sampleByScore`. Requires shipping a
  pruned, opening-depth-only frequency table as a static asset — not a live API call.
- **Effort:** medium-high (data pipeline + size budget). **Payoff:** highest of any item here.

#### A2. Schedule the positions you land in, not just the ones you memorized
The scheduler currently tracks only book decision positions
(`scheduling.ts:decisionPositions` filters to positions with saved accepted moves). The
positions where the trainee actually struggles — post-deviation middlegames — are played once
and discarded. Add a second item type: a *sparring position*, captured at the moment of
deviation, scheduled and re-served like a card.

- **Why it's in-niche:** it converts the product's unique moment into its unique memory unit.
  "Know the line, then prove you can play the position" becomes something you can actually
  practice repeatedly, rather than something you're tested on once.
- **Watch the boundary:** these are positions *from your own repertoire's frontier*, not a
  curated puzzle set. No global position library.
- **Depends on:** `types.ts:ReviewState` (add an item kind), `scheduling.ts:selectSession`,
  `training-machine.ts` (start a session from a stored FEN rather than a root route).
- **Effort:** medium. **Payoff:** very high — it is the clearest expansion of the core loop.

#### A3. Tell the user when the deviation transposes back
The graph is already transposition-aware, and positions are canonically keyed
(`position-key.ts`, `graph.ts:ensurePosition`). After a deviation, keep checking the resulting
position keys against the repertoire graph. If play rejoins the book, say so in review: "their
6…a6 rejoined your line at move 9 — you were still in your book and didn't know it."

- **Why it's in-niche:** it teaches the single most useful post-book skill, recognizing that an
  unfamiliar move order leads somewhere familiar. Pure seam value.
- **Depends on:** `training-machine.ts`, `review-screen.tsx`. Cheap — the data structures exist.
- **Effort:** low. **Payoff:** high relative to cost. Good early win.

#### A4. Continuation goals instead of a fixed ply horizon
Continuations currently end at a horizon and are scored by end-of-line evaluation
(`DrillLineResult.evaluationCp`). Replace the bare number with position-appropriate objectives:
hold the evaluation within a band, complete development, keep the structure intact, reach move
N without a decisive error. Report against the objective.

- **Why it's in-niche:** "did you survive leaving the book" is a better question than "what was
  the centipawn count," and it is the question this product exists to ask.
- **Watch the boundary:** objectives must be derived from the position, not authored as
  human-written lessons. Authored content is a course business.
- **Depends on:** `evaluation.ts`, `training-machine.ts`, `review-screen.tsx`.
- **Effort:** medium. **Payoff:** high — this is what makes the second half of a session legible.

#### A5. Critical-moment detection in review
Mean end-of-line evaluation hides *where* things went wrong. Run a post-session pass over the
continuation move ledger (`MoveLedgerEntry` is already recorded in full), compute per-move
evaluation change, and surface the one or two moves where the position actually turned.

- **Why it's in-niche:** §5.8 of the plan explicitly asks for eval-before/eval-after and
  best-line suggestions *in review only*; this delivers the chess-quality half of the split
  score the product promises.
- **Depends on:** `types.ts:MoveLedgerEntry`, `engine-adapter.ts` (batch post-session analysis),
  `review-screen.tsx`.
- **Effort:** medium (analysis is off the live path, so latency is forgiving).
- **Payoff:** high. Also the prerequisite for B2 and C1 below.

#### A6. A taxonomy of surprises
Classify each deviation by kind — early sideline, transposition attempt, premature attack,
gambit, quiet move-order change — and let the user practice by kind ("drill me on gambits I
haven't faced"). Classification can be heuristic and coarse.

- **Why it's in-niche:** it turns the surprise from a random event into a trainable category,
  which is exactly the product's subject matter.
- **Depends on:** `deviation.ts` at selection time; a label on the session record.
- **Effort:** medium. **Payoff:** medium-high, and it makes A1's realism visible to the user.

### Tier B — Make the review teach

Review currently reports two numbers. The product's promise is a *distinction* between recall
and play, and that distinction only becomes valuable once it is tracked over time.

#### B1. Trend the two dimensions separately
Persist per-session recall and continuation quality and chart them independently. The plan is
emphatic that these must not be blended into one score (§5.8) — the payoff for keeping them
separate is only realized when the user can see one improving while the other stalls.

- **Depends on:** `guest-store.ts` (a completed-sessions store), `review-screen.tsx`.
- **Effort:** low-medium. **Payoff:** high — it is the product's argument, made visible.

#### B2. "Repertoire debt" — theory you can't actually play
Cross-reference high first-try recall against poor continuation outcomes, per opening line.
The output is a list: *lines you know perfectly and play badly*. Rank them, and offer to drill
them with deviation frequency raised.

- **Why it's in-niche:** this metric is only computable by a product that measures both halves
  of the seam. No memorization tool and no play tool can produce it. It is arguably the single
  most defensible feature on this list.
- **Depends on:** A5 (per-move quality) and B1 (history).
- **Effort:** medium, given its dependencies. **Payoff:** very high; a genuine headline feature.

#### B3. Name the positions
Review rows currently read "Position 1…N" (`review-screen.tsx`). Derive a label from the move
path — either an offline ECO/opening-name table (small, and available under permissive terms)
or simply the SAN prefix. Users think in openings; anonymous rows waste the review screen.

- **Watch the boundary:** a *label*, not an encyclopedia entry. No theory text, no linked study.
- **Effort:** low. **Payoff:** medium, disproportionate to the effort. Good early win.

### Tier C — Repertoire quality, judged by the seam

Standard repertoire-management features are commodity. These aren't: each one evaluates the
repertoire *by how well it survives contact*, which only this product can do.

#### C1. Gap finder — where your book stops covering plausible replies
At every opponent-to-move position in the graph, ask the engine for candidates and compare
against saved edges. Positions where a *high-frequency, low-loss* reply has no saved answer are
the holes. Report them ranked, and offer to drill each one.

- **Why it's in-niche:** it uses the deviation sampler that already exists
  (`deviation.ts:selectDeviation`) as an auditing tool. The output is "here is where you will
  be surprised," which is the product's exact subject.
- **Depends on:** `deviation.ts`, `graph.ts`, and A1 for frequency-aware ranking.
- **Effort:** medium (batch analysis; must run off the interaction path).
- **Payoff:** high, and it directly drives repertoire editing — the retention loop.

#### C2. Depth advisor
Flag lines where the book ends while the position is still sharp (high evaluation volatility at
the leaf), versus lines that end in genuinely quiet positions. "Your Najdorf ends at move 8 in
the sharpest position in your repertoire."

- **Depends on:** leaf detection in `scheduling.ts:lineCount`, plus engine volatility sampling.
- **Effort:** medium. **Payoff:** medium-high.

#### C3. Promote a sparred line into the book
"+ Add this move" exists in training (`practice-screens.tsx`). Extend it: after a continuation
the user played well, offer to save the whole sequence as a new variation, with the deviation
as the opponent edge.

- **Why it's in-niche:** it closes the loop — the surprise becomes preparation. This is the
  product's growth mechanic, and it needs no new subsystem.
- **Depends on:** `graph.ts:addGraphMove`, `training-machine.ts` ledger.
- **Effort:** low-medium. **Payoff:** high. Strong candidate for the next thing built.

#### C4. Tags, chapters, and mixed review
Neither tags nor cross-repertoire review exists today (`selectSession` operates on one
repertoire's decision keys). Both are named in the plan (§12, §4.2). Mixed review in particular
matters because real preparation spans openings.

- **Effort:** medium. **Payoff:** medium — necessary infrastructure rather than differentiation.

### Tier D — Close the loop with real games

The strongest source of realistic deviations is the user's own opponents. This is in-niche as
long as it stays an *import*, not an analysis product.

#### D1. "Where did I leave book?" — import your own games
Let the user paste a PGN of games they actually played. Replay each against the repertoire
graph, find the exact ply where either side left the book, and report it: who deviated first,
what the move was, and how the game went afterwards. Offer each as a drill.

- **Why it's in-niche:** it answers the product's core question with real data instead of
  simulated data. It also converts a loss into a training item, which is a strong retention hook.
- **Watch the boundary:** report the *departure point* and offer a drill. Do **not** grow into
  full game annotation — that is Lichess's analysis board, and competing there is a losing fight.
- **Depends on:** `pgn.ts` (parse), `position-key.ts` (match against graph), a new report screen.
- **Effort:** medium. **Payoff:** very high. This is likely the best effort-to-value item in the
  document after A3/C3.

#### D2. Opponent preparation
Paste an opponent's games; project their move choices onto your repertoire to predict where
they will take you out of book; drill exactly those positions.

- **Why it's in-niche:** it is D1's machinery pointed at a specific opponent, and it is a real
  tournament-player workflow the primary persona (900–2200, club/tournament) already performs
  manually.
- **Watch the boundary:** driven by user-supplied PGN only. No scraping, no account-linked
  fetching of third-party game archives without a licensed, permitted route.
- **Effort:** medium (given D1). **Payoff:** high for the tournament segment specifically.

### Tier E — Enablers (in-niche because they protect the principles)

These add no new product surface. They are listed because Principle 3 (training stays fast) and
the guest-conversion path both depend on them, and because the plan already sequences them.

- **E1. Accounts and sync** (plan Phase 3) — the prototype is IndexedDB-only, so a repertoire
  dies with the browser profile. This gates any serious user.
- **E2. Offline/PWA** — the engine is already local; the app is unusually well-suited to
  offline, and tournament halls have bad wifi.
- **E3. Strength calibration and range** — strength is capped at 2000
  (`engine-strength.ts:MAX_ENGINE_ELO`) while the stated persona reaches 2200, and the label is
  approximate by construction since Lozza has no `UCI_LimitStrength`. Calibrating the mapping
  against observed user results would make the number trustworthy; extending the ceiling closes
  a gap against the stated audience.
- **E4. Hints as a graded step** — `ReviewGrade` supports "hard," and the plan's scoring model
  assumes a hint state, but no hint exists in the UI. A piece-level or "it's a knight move" hint
  is a cheap way to keep a stuck user in the session instead of revealing and losing the card.

### Tier F — Adjacent, and only after validation

Defensible in principle, but each one adds an audience or a business the product isn't ready
for. The plan already defers all of these; they are repeated here with the focus test applied.

- **F1. Coach assigns a repertoire to a student.** Passes tests 1–4, and coaches are a named
  primary persona. But it needs a membership/permission model and changes the support burden.
  Revisit after E1.
- **F2. Shareable seam moment.** A privacy-safe recap image or link of one deviation and how it
  went. Good acquisition, low product risk, but pointless before there are users to share to.
- **F3. Repertoire sharing between individuals.** One step from a marketplace — which fails the
  personal-truth test the moment shared books become "correct" books. Approach carefully or not
  at all.

---

## 4. Explicitly out of scope

Each of these fails the focus test, and each is a plausible-sounding request that would quietly
convert the product into a different one.

| Idea | Fails | Why it breaks the product |
|---|---|---|
| Full opening explorer with master games | 2, 5 | Makes the app an authority on correct openings; destroys "not in your repertoire ≠ blunder"; competes with Lichess's free database. |
| General analysis board | 1, 5 | Nothing to do with the seam. Every chess site already has one, better. |
| Live multiplayer / matchmaking | 1, 3, 4 | Different product, different infrastructure, anti-cheat burden, server cost per game. |
| Tactics or endgame trainer | 1 | Generic training content. Unbounded scope, zero connection to the user's repertoire. |
| Video courses or a content marketplace | 2, 5 | A content business with content economics. |
| Ratings, leaderboards, social feed | 3 | Optimizes time-in-app, which §18 explicitly rejects as a goal. |
| Chess960 and other variants | 1 | No repertoire seam to train; multiplies chess-rules edge cases. |
| Server-side engine for normal play | 4 | Marginal cost per move, latency, abuse surface. Keep the `EngineAdapter` seam so a server engine remains *possible* for deep post-session analysis only. |

---

## 5. Suggested sequence

Ordered by value per unit of effort, not by tier. The first three are small and compound.

1. **A3** (transposition-back detection) — low effort, uses structures already built.
2. **B3** (name the positions) — low effort, immediately improves the review screen.
3. **C3** (promote a sparred line into the book) — closes the surprise→preparation loop.
4. **D1** ("where did I leave book?" from your own games) — highest-value medium-effort item.
5. **A5 → B1 → B2** (per-move quality → history → repertoire debt) — a dependent chain ending in
   the most defensible feature in the document.
6. **A2** (schedule post-book positions) — the largest expansion of the core loop.
7. **A1** (human move frequencies) — highest realism payoff, largest data and size cost.
8. **E1** (accounts and sync) — required before any of Tier F, and before real users.

**C1** (gap finder) can be pulled forward at any point after A5; it needs no new data source and
turns the existing deviation sampler into a repertoire-auditing tool.
