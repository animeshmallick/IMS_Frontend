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
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="card">
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

export function Empty({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {hint ? <p>{hint}</p> : null}
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
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={danger ? "danger" : "primary"}
        onClick={() => setOpen(true)}
        disabled={disabled || pending}
      >
        {label}
      </button>

      {open ? (
        <Modal
          narrow
          title={title ?? label}
          onClose={() => !busy && setOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className={danger ? "danger" : "primary"}
                onClick={() => void run()}
                disabled={busy}
              >
                {busy ? "Working..." : confirmLabel}
              </button>
            </>
          }
        >
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
