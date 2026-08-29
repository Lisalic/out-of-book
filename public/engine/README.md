# Lozza engine provenance

This directory contains Lozza, a pure-JavaScript UCI chess engine with an
NNUE evaluation, by Colin Jenkins. It replaced a GPL-licensed Stockfish.js
build so the whole app can stay MIT-compatible.

- Upstream: <https://github.com/op12no2/lozza> (currently hosted at
  <https://github.com/namanthanki/lozza> after a repository transfer)
- Vendored build: "11" (`BUILD` constant in `lozza.js`)
- License: MIT; see `LICENSE-lozza.txt` in this directory.

Vendored files and SHA-256 digests:

- `lozza.js`: `92e77b25770e5cc66829f9b67e4dbe57b1a555517d917d539ab01a8e398116cf`
- `LICENSE-lozza.txt`: `984e208d3e54a349a0ee37711c0007ae8adb619234c20612f0cec7bcc08077c7`

Lozza speaks standard UCI over `postMessage` (position/go/setoption/isready,
info/bestmove) but does not implement Stockfish's `UCI_LimitStrength` /
`UCI_Elo` extension. Opponent strength is instead simulated in
`src/lib/chess/engine-strength.ts`, by scaling the search time budget and by
weighted sampling among Lozza's MultiPV candidates — see that file for the
approach used for both "play at a given strength" and "pick a plausible
deviation" moves.

The engine is loaded only when a training or review search needs it and runs
inside a dedicated browser Web Worker. No engine request is sent to a server.
