// Short-lived notices: what just happened, said once.
//
// An action with no acknowledgement leaves people repeating it to find out
// whether it worked, which for a destructive action is the worst possible
// outcome. These say what changed and then get out of the way.

import { useCallback, useEffect, useRef, useState } from "react";

import { useDict } from "./i18n";

export type ToastKind = "done" | "failed" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  /** The part that qualifies the headline, when there is something to qualify. */
  detail?: string;
}

/** How long each kind stays. A failure waits for the eye; a success need not. */
const LINGER: Record<ToastKind, number> = {
  done: 6000,
  info: 5000,
  // Failures are not dismissed on a timer: the text is the only record of what
  // went wrong, and it is usually something the user has to act on.
  failed: 0,
};

const MARK: Record<ToastKind, string> = {
  done: "✓",
  failed: "!",
  info: "·",
};

const MARK_COLOR: Record<ToastKind, string> = {
  done: "var(--shrink)",
  failed: "var(--alarm)",
  info: "var(--accent)",
};

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (kind: ToastKind, text: string, detail?: string) => {
      const id = next.current++;
      setToasts((prev) => [...prev, { id, kind, text, ...(detail ? { detail } : {}) }]);
      const linger = LINGER[kind];
      if (linger > 0) {
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), linger),
        );
      }
      return id;
    },
    [dismiss],
  );

  // Clearing on unmount stops a timer firing into a component that is gone.
  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  return { toasts, show, dismiss };
}

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss(id: number): void;
}) {
  const d = useDict();
  if (toasts.length === 0) return null;
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`} role="status">
          <span className="mark" style={{ color: MARK_COLOR[toast.kind] }}>
            {MARK[toast.kind]}
          </span>
          <span className="text">
            <b>{toast.text}</b>
            {toast.detail && <span>{toast.detail}</span>}
          </span>
          <button
            onClick={() => onDismiss(toast.id)}
            title={d.common.dismiss}
            aria-label={d.common.dismiss}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
