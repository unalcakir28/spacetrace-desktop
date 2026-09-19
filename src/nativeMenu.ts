// Switching off the webview's own right-click menu.
//
// This window is an application, not a page, and the menu WebKit puts up on a
// right-click says otherwise: it offers Reload, Back, and Inspect Element.
// Reload is the damaging one — it throws away every open tab, the selection and
// the scroll position, and it looks to the person using it like the app
// crashing rather than like something they asked for.
//
// So the default menu is suppressed everywhere except **text entry**, where the
// native menu is the only route to copy and paste and there is nothing in this
// app that replaces it. The app's own menus (the folder list, the map) call
// `preventDefault` themselves and are unaffected either way; this only decides
// what happens on the surfaces that have no menu of their own.
//
// Suppressed in the capture phase so a stray handler further down cannot let
// the default through, and registered once for the life of the window.

/** Elements where the native menu is the feature, not the intruder. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  // A checkbox or a range has nothing to copy; only the typing ones qualify.
  const type = (target as HTMLInputElement).type;
  return ["text", "search", "url", "email", "password", "tel", "number"].includes(type);
}

export function suppressNativeMenu(): void {
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (isTextEntry(event.target)) return;
      event.preventDefault();
    },
    { capture: true },
  );
}
