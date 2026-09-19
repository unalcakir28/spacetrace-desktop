// Handing an address to the browser.
//
// This window *is* the app; a web page loaded into it would have no way back,
// so every link opens outside. That call can be refused, and which addresses
// may be handed over is decided by the opener's scope in
// `src-tauri/capabilities/default.json` — a rejected promise is how it says no.
//
// Every call site used to be `void openUrl(…)`, which threw that answer away.
// The capability listed the permission with no scope at all, so the plugin
// refused every address, and two buttons and an update link simply did nothing
// for as long as they had existed. Swallowing the rejection is what made a
// misconfiguration indistinguishable from a dead button, so this returns it.

import { openUrl } from "@tauri-apps/plugin-opener";

/** True when the browser took it. False means the caller should say so. */
export async function openExternal(url: string): Promise<boolean> {
  try {
    await openUrl(url);
    return true;
  } catch {
    return false;
  }
}
