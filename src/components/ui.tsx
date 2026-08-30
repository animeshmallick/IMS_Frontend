import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";
import { ApiError } from "../lib/api";
import { SkeletonTable } from "./feedback";

/**
 * Shared presentational pieces.
 *
 * Deliberately small and unopinionated: the value is consistency, not
 * abstraction. Every list uses the same empty state and the same error banner,
 * so a user learns the vocabulary once.
 */

export function Card({
  title,
  actions,
  children,
  flush,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  /** Spacing or layout from the caller. The card owns its own appearance. */
  className?: string;
}) {
  return (
    <section className={className ? `card ${className}` : "card"}>
      {title || actions ? (
        <header className="card-head">
          {typeof title === "string" ? <h2>{title}</h2> : title}
          {actions ? <div className="btn-row">{actions}</div> : null}
        </header>
      ) : null}
      <div className={flush ? "card-body flush" : "card-body"}>{children}</div>
    </section>
  );
}

export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <div className="sub">{subtitle}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

/**
 * One figure and what it means.
 *
 * Every screen was writing this out by hand — `<Card><div className="stat">`
 * with a label div and a value div — which is why the figure sizes had drifted
 * apart and why not one of the twenty-odd tiles in the app carried an icon.
 *
 * `tone` colours the rail and the icon chip together, so a card that needs
 * attention is identifiable from across the room without a word being read. It
 * is never the only signal: the label says what the figure is, and the hint
 * says why it is that colour.
 */
export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  trailing,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Colours the leading rail and the icon chip. */
  tone?: "neutral" | "info" | "good" | "attention" | "critical";
  /** Sits on the figure's baseline — a delta, a unit, a share. */
  trailing?: ReactNode;
  /** Anything below the hint. A sparkline, usually. */
  children?: ReactNode;
}) {
  return (
    <div className={tone === "neutral" ? "stat" : `stat ${tone}`}>
      <div className="stat-head">
        {icon ? (
          <span className="stat-icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        <span className="label">{label}</span>
      </div>
      <div className="stat-value-row">
        <span className="value">{value}</span>
        {trailing}
      </div>
      {hint ? <div className="hint">{hint}</div> : null}
      {children}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "info" | "success" | "warn" | "danger";
  children: ReactNode;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

/**
 * Renders an API failure the way the user needs it: the server's message, which
 * is written to be actionable, plus the request id for anything unexplained.
 * Never a raw stack or a bare status code.
 */
export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;

  if (error instanceof ApiError) {
    return (
      <div className="alert error" role="alert">
        {error.message}
        {error.code === "INTERNAL_ERROR" && error.requestId ? (
          <span className="rid">Reference: {error.requestId}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="alert error" role="alert">
      {error instanceof Error ? error.message : "Something went wrong."}
    </div>
  );
}

/**
 * What a card shows when there is nothing in it.
 *
 * Compact and horizontal, not a centred block. "Nothing expiring" is a
 * one-line answer, and giving it two hundred pixels of card makes an empty
 * dashboard mostly empty space — the reader scrolls past three of these to
 * reach anything real.
 *
 * `icon` is optional and worth passing: at a glance it says which card this is
 * without the eye travelling up to the heading.
 */
export function Empty({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon ? <span className="empty-icon">{icon}</span> : null}
      <span className="empty-text">
        <strong>{title}</strong>
        {hint ? <span className="sub">{hint}</span> : null}
      </span>
      {action ? <span className="empty-action">{action}</span> : null}
    </div>
  );
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return <p className="loading">{label}</p>;
}

/**
 * One place that decides what a list looks like while loading, when it fails,
 * and when it is legitimately empty — three states every screen otherwise
 * forgets one of.
 */
export function QueryState({
  query,
  empty,
  skeleton,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; data?: unknown };
  empty?: ReactNode;
  skeleton?: ReactNode;
  children: ReactNode;
}) {
  /*
   * A skeleton rather than a spinner: it reserves the space the rows will take,
   * so the page does not jump when they arrive and the eye is already in the
   * right place. `skeleton` lets a caller shape it like the content it is
   * standing in for.
   */
  if (query.isPending) return skeleton ?? <SkeletonTable />;
  if (query.isError) return <ErrorBanner error={query.error} />;
  if (empty && Array.isArray(query.data) && query.data.length === 0) return <>{empty}</>;
  return <>{children}</>;
}

export function Field({
  label,
  help,
  error,
  children,
}: {
  label?: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      {label ? <label>{label}</label> : null}
      {children}
      {help ? <span className="help">{help}</span> : null}
      {error ? <span className="err">{error}</span> : null}
    </div>
  );
}

export function TextField({
  label,
  help,
  ...props
}: { label?: string; help?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} help={help}>
      <input {...props} />
    </Field>
  );
}

export function SelectField({
  label,
  help,
  children,
  ...props
}: {
  label?: string;
  help?: ReactNode;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} help={help}>
      <select {...props}>{children}</select>
    </Field>
  );
}

export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>{head}</thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * A modal dialog, on Radix.
 *
 * The behaviour that makes a dialog trustworthy is nearly all invisible: focus
 * moves in on open and returns to the trigger on close, Tab is trapped inside,
 * Escape dismisses, the page behind stops scrolling, and the rest of the app is
 * hidden from screen readers while it is up. Hand-rolling that is a long tail
 * of small bugs found by the people least able to work around them, so it is
 * delegated.
 *
 * The props are unchanged from the hand-rolled version this replaces, so no
 * caller needed editing.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  narrow,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  narrow?: boolean;
  wide?: boolean;
}) {
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-backdrop" />
        <DialogPrimitive.Content
          className={`modal${narrow ? " narrow" : ""}${wide ? " wide" : ""}`}
        >
          <header className="modal-head">
            <DialogPrimitive.Title asChild>
              <h2>{title}</h2>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button type="button" className="ghost" aria-label="Close">
                ✕
              </button>
            </DialogPrimitive.Close>
          </header>
          <div className="modal-body">{children}</div>
          {footer ? <footer className="modal-foot">{footer}</footer> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Confirmation for actions that cannot be undone.
 *
 * Posting a receipt, approving a write-off and closing a shortage all move real
 * stock and cannot be reversed except by another document, so each asks first
 * and says plainly what will happen.
 */
export function ConfirmButton({
  label,
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  danger,
  disabled,
  pending,
  triggerClassName,
  children,
}: {
  label: string;
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<unknown>;
  danger?: boolean;
  disabled?: boolean;
  pending?: boolean;
  /**
   * Overrides the trigger's classes. A row action wants a quiet
   * `"sm subtle-danger"`; a page-level destructive action wants the default
   * filled button. The dialog is identical either way.
   */
  triggerClassName?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  async function run() {
    setBusy(true);
    setFailure(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (error) {
      /*
       * Stay open, and say why.
       *
       * The server refuses a destructive action for a reason it states
       * precisely — "40 still on hand, sell or write it off first", "3 products
       * are still in this category". That sentence is the whole answer, and it
       * belongs in the dialog the user is looking at rather than only in a
       * toast that slides away after five seconds.
       *
       * Closing on failure would drop them back to an unchanged list with no
       * explanation, which reads as the button not working.
       */
      setFailure(error);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    // A stale refusal must not greet the next attempt.
    setFailure(null);
  }

  return (
    <>
      <button
        type="button"
        className={triggerClassName ?? (danger ? "danger" : "primary")}
        onClick={() => setOpen(true)}
        disabled={disabled || pending}
      >
        {label}
      </button>

      {open ? (
        <Modal
          narrow
          title={title ?? label}
          onClose={() => !busy && close()}
          footer={
            <>
              <button type="button" onClick={close} disabled={busy}>
                {failure ? "Close" : "Cancel"}
              </button>
              {/*
                * A spinner in place of the label, not a label that changes.
                *
                * "Working..." is narrower than most confirm labels, so the
                * button used to shrink at the exact moment somebody was looking
                * to see whether their click had registered — and a control that
                * moves under the cursor reads as a misfire. The button now
                * keeps its size and spins in place.
                */}
              <button
                type="button"
                className={`${danger ? "danger" : "primary"}${busy ? " busy" : ""}`}
                onClick={() => void run()}
                disabled={busy}
              >
                {confirmLabel}
              </button>
            </>
          }
        >
          {/* The refusal leads, because once there is one it is the only thing
              worth reading in this dialog. */}
          <ErrorBanner error={failure} />
          <p>{message}</p>
          {children}
        </Modal>
      ) : null}
    </>
  );
}

/** Simple controlled form wrapper that prevents the default submit. */
export function Form({
  onSubmit,
  children,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(event);
      }}
    >
      {children}
    </form>
  );
}

/**
 * Offset/limit pager matching the backend's `meta` envelope.
 *
 * `total` may be null: some endpoints are grouped aggregates where counting
 * costs a second full scan, so they report `hasMore` instead. With no total
 * there is no last page to jump to and no "of N" to show — the pager falls back
 * to "showing 51–100" and a Next button driven by `hasMore`.
 */
export function Pager({
  total,
  hasMore = false,
  limit,
  offset,
  onChange,
}: {
  total: number | null;
  hasMore?: boolean;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}) {
  if (total === null) {
    if (offset === 0 && !hasMore) return null;
    return (
      <div className="spread mt small muted">
        <span>
          {offset + 1}–{offset + limit}
        </span>
        <div className="btn-row">
          <button
            type="button"
            className="sm"
            disabled={offset === 0}
            onClick={() => onChange(Math.max(0, offset - limit))}
          >
            Previous
          </button>
          <button
            type="button"
            className="sm"
            disabled={!hasMore}
            onClick={() => onChange(offset + limit)}
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  if (total <= limit) return null;
  const from = offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <div className="spread mt small muted">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="btn-row">
        <button
          type="button"
          className="sm"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Previous
        </button>
        <button
          type="button"
          className="sm"
          disabled={to >= total}
          onClick={() => onChange(offset + limit)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/**
 * Debounced value, for search boxes that hit the API on every keystroke.
 * 250 ms is below the threshold where typing feels laggy and well above the
 * rate at which a fast typist would otherwise fire a request per character.
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
