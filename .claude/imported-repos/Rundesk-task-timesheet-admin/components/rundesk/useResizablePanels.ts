"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Config = {
  key: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  collapsedWidth?: number;
};

export function useResizablePanel({ key, defaultWidth, minWidth, maxWidth, collapsedWidth = 0 }: Config) {
  const readSavedWidth = () => { if (typeof window === "undefined") return defaultWidth; const saved = Number(localStorage.getItem(`${key}:width`)); return Number.isFinite(saved) && saved >= minWidth && saved <= maxWidth ? saved : defaultWidth; };
  const readSavedCollapsed = () => typeof window !== "undefined" && localStorage.getItem(`${key}:collapsed`) === "true";
  const [width, setWidth] = useState(readSavedWidth);
  const [collapsed, setCollapsed] = useState(readSavedCollapsed);
  const previousWidth = useRef(width);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(defaultWidth);


  useEffect(() => {
    if (!collapsed) localStorage.setItem(`${key}:width`, String(width));
    localStorage.setItem(`${key}:collapsed`, String(collapsed));
  }, [collapsed, key, width]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (collapsed) return;
    dragging.current = true;
    startX.current = event.clientX;
    startWidth.current = width;
    document.body.classList.add("is-resizing-panels");
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [collapsed, width]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragging.current) return;
      const next = Math.min(maxWidth, Math.max(minWidth, startWidth.current + event.clientX - startX.current));
      setWidth(next);
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove("is-resizing-panels");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("is-resizing-panels");
    };
  }, [maxWidth, minWidth]);

  const toggle = useCallback(() => {
    setCollapsed(current => {
      if (current) {
        setWidth(previousWidth.current || defaultWidth);
        return false;
      }
      previousWidth.current = width;
      return true;
    });
  }, [defaultWidth, width]);

  const reset = useCallback(() => {
    previousWidth.current = defaultWidth;
    setWidth(defaultWidth);
    setCollapsed(false);
  }, [defaultWidth]);

  return {
    width: collapsed ? collapsedWidth : width,
    expandedWidth: width,
    collapsed,
    toggle,
    reset,
    onPointerDown,
  };
}
