import { useRef, type KeyboardEvent } from "react";

/**
 * A tab list that works from the keyboard.
 *
 * Tabs are usually built as a row of buttons, which leaves a keyboard user
 * tabbing through every one to reach the content — the pattern's own guidance
 * says otherwise, and it is the part everyone skips. So: one stop in the tab
 * order, arrows to move between tabs, Home and End to jump to the ends, and the
 * selected tab is the one that holds focus.
 *
 * Selection follows focus, which is right when switching is instant and free —
 * as it is here, where the panel is a list already in memory.
 */
export interface Tab {
  id: string;
  label: string;
  count?: number;
  /** Drawn as a dot and announced, so a tab can say it needs attention. */
  badge?: number;
}

export function Tabs({
  tabs,
  selected,
  onSelect,
  label,
  idPrefix,
}: {
  tabs: Tab[];
  selected: string;
  onSelect: (id: string) => void;
  /** What this set of tabs is for, for anyone who cannot see the heading. */
  label: string;
  idPrefix: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === selected);
    if (index === -1) return;

    const keys: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    const target = keys[event.key];
    if (target === undefined) return;

    event.preventDefault();
    // Wraps, because a tab strip is a ring: pressing right on the last one
    // should not feel like hitting a wall.
    const next = tabs[(target + tabs.length) % tabs.length];
    onSelect(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={move}
      className="mb-3 flex flex-wrap gap-1 border-b border-hairline"
    >
      {tabs.map((tab) => {
        const active = tab.id === selected;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              refs.current[tab.id] = element;
            }}
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            // Only the selected tab is in the tab order; the arrows do the rest.
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
              active
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="font-mono text-[11px] text-faint">{tab.count}</span>
            )}
            {tab.badge ? (
              <>
                <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                {/* The dot is decoration; this is the fact. */}
                <span className="sr-only">{tab.badge} to use soon</span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
