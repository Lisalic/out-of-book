import Link from "next/link";

export default function LicensesPage() {
  return (
    <main className="mx-auto my-16 w-[min(760px,calc(100%-56px))] leading-relaxed">
      <Link href="/" className="mono text-xs font-bold tracking-wide text-accent uppercase hover:text-ink">← Back to Out of Book</Link>
      <h1 className="mt-6 mb-3 text-5xl font-bold tracking-tighter">OPEN-SOURCE LICENSES</h1>
      <p className="text-ink-muted">This local prototype includes software we are grateful to build upon.</p>
      <div className="mt-8 flex flex-col gap-0.5">
        <section className="panel p-6.5">
          <h2 className="text-xl font-semibold tracking-tight">Lozza 11</h2>
          <p className="mt-2.5 text-ink-muted">
            The browser engine is Lozza, a pure-JavaScript UCI engine with an NNUE evaluation,
            by Colin Jenkins, distributed under the MIT License.
          </p>
          <p className="mono mt-3 text-xs">
            <a className="text-accent hover:text-ink" href="https://github.com/namanthanki/lozza">Source code</a>
            {" · "}<a className="text-accent hover:text-ink" href="/engine/LICENSE-lozza.txt">MIT license text</a>
            {" · "}<a className="text-accent hover:text-ink" href="/engine/README.md">binary provenance</a>
          </p>
        </section>
        <section className="panel p-6.5">
          <h2 className="text-xl font-semibold tracking-tight">react-chessboard 5.12.1</h2>
          <p className="mt-2.5 text-ink-muted">
            Copyright © Ryan Gregory. The board interface, piece artwork, drag-and-drop,
            mobile behavior, and accessibility foundation are distributed under the MIT License.
          </p>
          <p className="mono mt-3 text-xs"><a className="text-accent hover:text-ink" href="https://github.com/Clariity/react-chessboard/tree/v5.12.1">Source code</a></p>
        </section>
        <section className="panel p-6.5">
          <h2 className="text-xl font-semibold tracking-tight">chess.js 1.4.0</h2>
          <p className="mt-2.5 text-ink-muted">Copyright © Jeff Hlywa, distributed under the BSD-2-Clause license.</p>
        </section>
        <section className="panel p-6.5">
          <h2 className="text-xl font-semibold tracking-tight">idb 8.0.3</h2>
          <p className="mt-2.5 text-ink-muted">Copyright © Jake Archibald, distributed under the ISC license.</p>
        </section>
      </div>
    </main>
  );
}
