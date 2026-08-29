import * as ToastPrimitive from "@radix-ui/react-toast";
import { Component, createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";

/*
 * The feedback layer: what the app says while it is working, and what it says
 * when it breaks.
 *
 * All three pieces here exist because of the same gap. Before them a slow query
 * showed nothing at all, a successful save showed nothing at all, and a render
 * error showed a blank white page — the browser console being the only place
 * any of it was visible, which is no use to someone standing at a till.
 */

/* ============================================================ error boundary */

/**
 * Stops a render error taking the whole application down.
 *
 * React unmounts the entire tree when a render throws and nothing catches it,
 * so one bad row in one table blanks the screen — no navigation, no way back,
 * nothing on screen to report. That is what "map is not a function" did.
 *
 * Scoped per route rather than wrapped once around the app, so a broken screen
 * leaves the sidebar and every other screen usable.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: (error: Error, reset: () => void) => ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the component stack: the message alone rarely says which screen.
    console.error("[ims] render error", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="card">
        <div className="card-body">
          <h2 className="mb">This screen stopped working</h2>
          <p className="hint mb">
            The rest of the app is fine — use the menu to go elsewhere, or try again.
            If it keeps happening, send this message to whoever maintains the system.
          </p>
          <pre className="alert error mono small" style={{ whiteSpace: "pre-wrap" }}>
            {error.message}
          </pre>
          <div className="btn-row">
            <button type="button" className="primary" onClick={this.reset}>
              Try again
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              Reload the page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/* ==================================================================== toasts */

type Tone = "success" | "error" | "warn" | "info";
type ToastItem = { id: number; title: string; body?: string; tone: Tone };

const ToastContext = createContext<{
  toast: (title: string, options?: { body?: string; tone?: Tone }) => void;
} | null>(null);

/**
 * Confirmation that something happened.
 *
 * A save that changes nothing on screen is indistinguishable from a save that
 * silently failed, and the usual reaction is to press the button again — which
 * on a counter means a second bill. Every mutation should say so.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback(
    (title: string, options?: { body?: string; tone?: Tone }) => {
      setItems((current) => [
        ...current,
        { id: Date.now() + Math.random(), title, body: options?.body, tone: options?.tone ?? "info" },
      ]);
    },
    [],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            className={`toast ${item.tone}`}
            onOpenChange={(open) => {
              if (!open) setItems((current) => current.filter((t) => t.id !== item.id));
            }}
          >
            <div className="grow">
              <ToastPrimitive.Title className="title">{item.title}</ToastPrimitive.Title>
              {item.body ? (
                <ToastPrimitive.Description className="hint">
                  {item.body}
                </ToastPrimitive.Description>
              ) : null}
            </div>
            <ToastPrimitive.Close asChild>
              <button type="button" className="ghost sm" aria-label="Dismiss">
                ✕
              </button>
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="toast-viewport" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

/**
 * Returns a `toast` function. Safe to call outside a provider — it falls back to
 * the console rather than throwing, so a component rendered in isolation (a
 * test, a detached panel) does not crash for want of a notification.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  return (
    ctx ?? {
      toast: (title: string, options?: { body?: string; tone?: Tone }) =>
        console.info("[toast]", title, options?.body ?? ""),
    }
  );
}

/* ================================================================ skeletons */

/**
 * A placeholder shaped like the content that is coming.
 *
 * A spinner says "something is happening". A skeleton says "a table of eight
 * rows is arriving here" — so the layout does not jump when it does, and the
 * eye is already where the first row will be.
 */
export function Skeleton({ width, height }: { width?: string | number; height?: string | number }) {
  return <div className="skeleton" style={{ width, height }} aria-hidden="true" />;
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, r) => (
        <div className="skeleton-row" key={r}>
          {Array.from({ length: cols }, (_, c) => (
            // Varying widths so it reads as content rather than a bar chart.
            <Skeleton key={c} width={c === 0 ? "22%" : `${10 + ((r + c) % 4) * 4}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid cols-4" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="card" key={i}>
          <div className="stat">
            <Skeleton width="45%" height="0.6rem" />
            <div style={{ height: "0.75rem" }} />
            <Skeleton width="70%" height="1.4rem" />
          </div>
        </div>
      ))}
    </div>
  );
}
