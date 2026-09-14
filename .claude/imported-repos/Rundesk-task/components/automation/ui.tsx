"use client";

/**
 * Tiny set of presentational primitives used by the automation components.
 * They only use Tailwind classes + the theme tokens defined in globals.css, so
 * you can either keep them or swap in Rundesk's own design-system components
 * (they are all thin wrappers over native elements).
 */

import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

const control =
  "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-fg " +
  "placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/60 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(control, "appearance-auto", className)} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(control, className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} rows={props.rows ?? 2} className={cx(control, "resize-y", className)} />;
}

type ButtonVariant = "primary" | "ghost" | "danger" | "subtle";
const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-accent to-accent-2 text-white shadow-lg shadow-accent/20 hover:brightness-110",
  ghost: "border border-line bg-transparent text-fg hover:bg-panel-2",
  subtle: "bg-panel-2 text-fg hover:bg-line/60",
  danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <button
      type={props.type ?? "button"}
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
        "disabled:cursor-not-allowed disabled:opacity-50",
        buttonStyles[variant],
        className,
      )}
    />
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
      {children}
      {hint && <span className="ml-1 normal-case tracking-normal text-muted/70">({hint})</span>}
    </label>
  );
}

type Tone = "ok" | "warn" | "danger" | "neutral" | "accent";
const badgeStyles: Record<Tone, string> = {
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/15 text-danger",
  neutral: "bg-line/60 text-muted",
  accent: "bg-accent/20 text-accent-2",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", badgeStyles[tone])}>
      {children}
    </span>
  );
}

export function Card({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-2xl border border-line bg-panel p-5 shadow-xl shadow-black/20", className)}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold text-fg">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Step header used by the builder: numbered pill + title. */
export function Step({ n, title, right }: { n: number; title: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent-2">
          {n}
        </span>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
      </div>
      {right}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ClickUp-style extras: Toggle, Tag, Modal, Popover                  */
/* ------------------------------------------------------------------ */

/** On/off switch (violet when on). */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-accent" : "bg-line",
        disabled && "cursor-wait opacity-60",
      )}
    >
      <span
        className={cx(
          "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="text-[10px] font-medium text-muted/80">{children}</span>;
}

/** Centered dialog with backdrop; closes on Esc or backdrop click. */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  width = "max-w-3xl",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cx("my-6 w-full rounded-2xl border border-line bg-panel shadow-2xl", width)}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-fg">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </header>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

/** Floating panel anchored to its parent (parent must be `relative`); closes on outside click. */
export function Popover({
  onClose,
  className,
  children,
}: {
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={cx("absolute z-40 rounded-2xl border border-line bg-panel shadow-2xl shadow-black/40", className)}
    >
      {children}
    </div>
  );
}
