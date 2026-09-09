// "There is a newer version" — as a bar, and only after you say so.
//
// Three decisions worth keeping:
//
// * **A bar, not a modal.** The app was opened to look at a disk. Blocking
//   that to announce a version is the wrong trade, and a dialog on launch is
//   the thing people click through without reading.
//
// * **Nothing is downloaded until the button is pressed.** This app is not
//   code-signed, so an unsigned binary replacing itself in the background is a
//   bad shape regardless of the signature Tauri checks. It also spends someone
//   else's bandwidth without asking.
//
// * **What changed is a link, not text.** The update manifest can only carry
//   notes in one language, and this window may be in any of five. The
//   notification itself is translated, the link goes to the reader's own
//   language on the site, and after the update the app's own What's new panel
//   has the entries — in their language, from the new binary.

import { useCallback, useEffect, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";

import { api } from "./api";
import { fill, useDict, useLocale } from "./i18n";

type Stage = "idle" | "found" | "installing" | "failed";

/** The site's changelog, in the reader's language. English carries no prefix. */
function changelogUrl(locale: string): string {
  const prefix = locale === "en" ? "" : `/${locale}`;
  return `https://spacetrace.teknobakkall.com${prefix}/changelog/`;
}

export function UpdateBar() {
  const d = useDict();
  const locale = useLocale();
  const [stage, setStage] = useState<Stage>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [current, setCurrent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const build = await api.buildInfo().catch(() => null);
      if (cancelled || !build) return;
      setCurrent(build.version);

      // A development or continuous build reports the same version as the last
      // release, so a check would either say nothing or offer an "upgrade" to
      // the code already running. Silence is the right answer there.
      if (!build.isRelease) return;

      // Failure is silent on purpose: no network, a blocked domain or a
      // proxy must not produce an error bar over someone's disk map.
      const found = await check().catch(() => null);
      if (cancelled || !found) return;
      setUpdate(found);
      setStage("found");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const install = useCallback(async () => {
    if (!update) return;
    setStage("installing");
    try {
      await update.downloadAndInstall();
      // Restarting is the app replacing itself; there is nothing left to show
      // in this window, and leaving it open would leave the old code running.
      await relaunch();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("failed");
    }
  }, [update]);

  if (stage === "idle" || !update) return null;

  return (
    <div className="update-bar" role="status">
      <span className="what">
        <b>{fill(d.update.available, { version: update.version })}</b>
        <span className="dim">{fill(d.update.availableDetail, { current })}</span>
        {stage === "failed" && <span className="fail">{d.update.failed}: {error}</span>}
      </span>

      <button className="ghost" onClick={() => void openUrl(changelogUrl(locale))}>
        {d.update.seeWhatsNew}
      </button>
      <button
        className="primary"
        onClick={() => void install()}
        disabled={stage === "installing"}
      >
        {stage === "installing" ? d.update.installing : d.update.install}
      </button>
      <button
        className="ghost"
        onClick={() => setStage("idle")}
        disabled={stage === "installing"}
      >
        {d.update.later}
      </button>
    </div>
  );
}
