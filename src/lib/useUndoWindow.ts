"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Holds one pending action for `seconds`, counting down, then runs `onExpire`.
 * Used for swap / give-away notices: the change is already made, and the
 * person gets a short window to undo it before anyone is told.
 *
 * `flush` runs the action immediately. It also fires when the page is hidden,
 * closed or unmounted — a timer cannot be trusted to keep running once the
 * person leaves — so leaving the page sends the notice rather than losing it.
 * `keepalive` is true in those cases so the request survives the page.
 */
export function useUndoWindow<T>(onExpire: (item: T, keepalive: boolean) => void, seconds = 60) {
  const [pending, setPending] = useState<T | null>(null);
  const [left, setLeft] = useState(0);
  const itemRef = useRef<T | null>(null);
  const cbRef = useRef(onExpire);
  cbRef.current = onExpire;

  const flush = useCallback((keepalive = false) => {
    const item = itemRef.current;
    if (item === null) return;
    itemRef.current = null;
    setPending(null);
    cbRef.current(item, keepalive);
  }, []);

  const cancel = useCallback(() => {
    itemRef.current = null;
    setPending(null);
  }, []);

  const start = useCallback((item: T) => {
    flush();
    itemRef.current = item;
    setPending(item);
    setLeft(seconds);
  }, [flush, seconds]);

  useEffect(() => {
    if (pending === null) return;
    const t = setInterval(() => {
      setLeft((n) => {
        if (n <= 1) { queueMicrotask(() => flush()); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pending, flush]);

  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") flush(true); };
    const leave = () => flush(true);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      flush(true);
    };
  }, [flush]);

  return { pending, left, start, flush, cancel };
}
