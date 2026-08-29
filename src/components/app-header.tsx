"use client";

export type AppSection = "home" | "practice" | "repertoires";
export type SaveStatus = "saved" | "error";

interface AppHeaderProps {
  active: AppSection;
  saveStatus: SaveStatus;
  onNavigate: (section: AppSection) => void;
}

const SECTIONS: Array<{ id: AppSection; label: string }> = [
  { id: "home", label: "Today" },
  { id: "practice", label: "Practise" },
  { id: "repertoires", label: "Repertoires" },
];

export function AppHeader({ active, saveStatus, onNavigate }: AppHeaderProps) {
  return (
    <header className="grid h-[72px] grid-cols-[auto_1fr_auto] items-center gap-8 bg-canvas px-4 sm:px-9">
      <button
        type="button"
        className="flex items-center gap-3 border-0 bg-transparent p-0"
        onClick={() => onNavigate("home")}
        aria-label="Out of Book home"
      >
        <span className="grid h-[30px] w-[30px] place-items-center bg-accent text-lg text-accent-ink" aria-hidden="true">♞</span>
        <strong className="hidden text-lg font-bold tracking-tight sm:inline">Out of Book</strong>
      </button>

      <nav aria-label="Main navigation" className="flex items-center justify-center gap-0.5">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => onNavigate(section.id)}
            className={`mono px-4.5 py-2.5 text-xs font-bold tracking-wide uppercase transition-colors ${
              active === section.id ? "bg-accent text-accent-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <span className={`mono hidden text-[11px] sm:inline ${saveStatus === "error" ? "text-danger" : "text-ink-faint"}`}>
        {saveStatus === "error" ? "Not saved" : "Saved on this device"}
      </span>
    </header>
  );
}
