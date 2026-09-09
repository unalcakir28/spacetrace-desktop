// Which build this is, in which language, and what changed.
//
// One panel rather than three, because the three questions arrive together:
// someone opening this either wants to report a problem (and needs the build),
// or has just been updated (and wants to know what moved), or wants the window
// in their own language. Splitting them across a menu, a preferences pane and a
// web page is how each one ends up hard to find.
//
// The changelog is read from the binary, not fetched. The moment it is most
// likely to be opened is right after the app has replaced itself, which is also
// a moment the machine may be offline.

import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

import { api, type BuildInfo, type ChangelogRelease } from "./api";
import {
  LOCALES,
  LOCALE_NAMES,
  locale as activeLocale,
  setLocale,
  useDict,
  useLocale,
  type Locale,
} from "./i18n";

const SITE = "https://spacetrace.teknobakkall.com";
const SOURCE = "https://github.com/unalcakir28/spacetrace";

export function About({ onClose }: { onClose(): void }) {
  const d = useDict();
  const current = useLocale();
  const [build, setBuild] = useState<BuildInfo | null>(null);
  const [releases, setReleases] = useState<ChangelogRelease[]>([]);

  useEffect(() => {
    api.buildInfo().then(setBuild).catch(() => {
      /* The panel is still worth showing without it. */
    });
  }, []);

  // Re-fetched per language rather than translated in the window: the entries
  // live in the binary in all five, and only one is ever on screen.
  useEffect(() => {
    let cancelled = false;
    api
      .changelog(current)
      .then((result) => !cancelled && setReleases(result))
      .catch(() => {
        /* Leaves the What's new section empty, which the copy covers. */
      });
    return () => {
      cancelled = true;
    };
  }, [current]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kindLabel = (kind: string): string =>
    d.about.kinds[kind as keyof typeof d.about.kinds] ?? kind;

  return (
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" style={{ maxWidth: 620 }} role="dialog" aria-modal="true">
        <header>
          <h2>{d.about.title}</h2>
        </header>

        <div className="body">
          <dl className="kv">
            <dt>{d.about.version}</dt>
            <dd>
              <b>{build?.version ?? d.common.nothing}</b>
            </dd>
            <dt>{d.about.build}</dt>
            {/* The commit, not just the number: every continuous build shares
                one version, so this is the only line that identifies a build in
                a bug report. */}
            <dd>
              <span className="num">{build?.commit ?? d.common.nothing}</span>
            </dd>
            <dt>{d.about.built}</dt>
            <dd>
              <span className="num">{build?.built ?? d.common.nothing}</span>
            </dd>
            <dt>{d.about.channel}</dt>
            <dd>{build?.channel ?? d.common.nothing}</dd>
            <dt>{d.about.licence}</dt>
            <dd>{d.about.licenceNote}</dd>
          </dl>

          <div className="field" style={{ marginTop: 4 }}>
            <label htmlFor="about-locale">{d.language.label}</label>
            <select
              id="about-locale"
              value={current}
              onChange={(event) => setLocale(event.target.value as Locale)}
              style={{ width: "auto" }}
            >
              {LOCALES.map((option) => (
                <option key={option} value={option}>
                  {LOCALE_NAMES[option]}
                </option>
              ))}
            </select>
          </div>
          <p className="hint" style={{ marginTop: 0 }}>
            {d.language.note}
          </p>

          <div className="panel-title" style={{ paddingLeft: 0, marginTop: 14 }}>
            {d.about.whatsNew}
          </div>

          {releases.length === 0 ? (
            <p className="hint" style={{ marginTop: 0 }}>
              {d.about.noChanges}
            </p>
          ) : (
            <div className="changelog">
              {releases.map((release) => (
                <section key={release.version || "unreleased"}>
                  <h4>
                    <span className="num">
                      {release.version || d.about.whatsNew}
                    </span>
                    {release.date && <em>{release.date}</em>}
                    {release.version && !release.published && (
                      <span className="badge warn">{d.about.milestone}</span>
                    )}
                  </h4>
                  <ul>
                    {release.entries.map((entry, index) => (
                      <li key={`${entry.kind}-${index}`}>
                        <b>{kindLabel(entry.kind)}</b> {entry.text}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <footer>
          {/* Opened in the browser rather than in the webview: this window is
              the app, and a marketing page loaded into it would have no way
              back. */}
          <button onClick={() => void openUrl(SITE)}>{d.about.website}</button>
          <button onClick={() => void openUrl(SOURCE)}>{d.about.sourceCode}</button>
          <span style={{ flex: 1 }} />
          <button className="primary" onClick={onClose}>
            {d.common.close}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Whether the language is one this build knows, for callers outside React. */
export function currentLocale(): Locale {
  return activeLocale();
}
