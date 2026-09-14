import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A short-lived status line ("Time added", "Submitted for approval").
 * Returns the current notice and a `flash(message)` that shows it for
 * `durationMs`; a new flash replaces the previous one and resets the clock.
 */
export function useFlash(durationMs = 1800): [string, (message: string) => void] {
  const [notice, setNotice] = useState("");
  const timer = useRef<number | null>(null);

  const flash = useCallback(
    (message: string) => {
      setNotice(message);

      if (timer.current) {
        window.clearTimeout(timer.current);
      }

      timer.current = window.setTimeout(() => setNotice(""), durationMs);
    },
    [durationMs],
  );

  useEffect(
    () => () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
      }
    },
    [],
  );

  return [notice, flash];
}
