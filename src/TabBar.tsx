// The row of open scans.
//
// Deliberately the same shape as a browser's, because that is the thing people
// already know: home on the left and fixed, a tab per scan beside it, middle
// click or the cross to close, and the one in front is the one being read.
//
// **The bar is not a list of places, it is a list of open trees.** Each tab is
// holding a scan in memory for as long as it is there, which is why closing one
// is a real action with a real effect and not a view being tidied away.

import type { Tab } from "./tabs";
import { useDict } from "./i18n";

export interface TabBarProps {
  tabs: Tab[];
  activeId: number;
  onSelect(id: number): void;
  onClose(id: number): void;
  /** Open the home tab's scan chooser, the way a browser's `+` behaves. */
  onNew(): void;
}

export function TabBar({ tabs, activeId, onSelect, onClose, onNew }: TabBarProps) {
  const d = useDict();

  return (
    <div className="tabbar" role="tablist" aria-label={d.tabs.bar}>
      {tabs.map((tab) => {
        const current = tab.id === activeId;
        const scanning = tab.opened?.source.kind === "scanning";
        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={current ? 0 : -1}
            aria-selected={current}
            className={`tab${current ? " current" : ""}${tab.kind === "home" ? " home" : ""}`}
            title={title(tab)}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(tab.id);
              }
            }}
            onAuxClick={(event) => {
              // Middle click closes, as everywhere else. Home has nothing to
              // close, so it simply does not answer.
              if (event.button !== 1 || tab.kind === "home") return;
              event.preventDefault();
              onClose(tab.id);
            }}
          >
            {tab.kind === "home" ? <HomeMark /> : <span className={`dot${scanning ? " live" : ""}`} />}
            <span className="name">{tab.kind === "home" ? d.tabs.home : tab.title}</span>
            {tab.kind !== "home" && (
              <button
                className="shut"
                aria-label={d.tabs.close}
                title={d.tabs.close}
                onClick={(event) => {
                  // Without this the click reaches the tab and selects the very
                  // tab it is closing.
                  event.stopPropagation();
                  onClose(tab.id);
                }}
              >
                <Cross />
              </button>
            )}
          </div>
        );
      })}

      <button className="newtab" aria-label={d.tabs.newScan} title={d.tabs.newScan} onClick={onNew}>
        +
      </button>
    </div>
  );
}

function title(tab: Tab): string {
  if (tab.kind === "home") return "";
  const source = tab.opened?.source;
  if (source && "root" in source) return source.root;
  return tab.title;
}

function HomeMark() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path
        d="M2.5 7.4 8 3l5.5 4.4V13a.5.5 0 0 1-.5.5H9.6V10H6.4v3.5H3a.5.5 0 0 1-.5-.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Cross() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
