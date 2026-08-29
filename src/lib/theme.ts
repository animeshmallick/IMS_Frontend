import { useEffect, useState } from "react";

/**
 * Light / dark / system, persisted per browser.
 *
 * Three states, not two. "System" is the default and stamps nothing on the
 * root element, leaving `prefers-color-scheme` to decide — which is what most
 * people actually want. An explicit choice stamps `data-theme`, and the
 * stylesheet is written so that stamp beats the media query in both directions.
 *
 * The stored value is a preference, not state the app depends on: a browser
 * that refuses localStorage (private window, blocked site data) throws on
 * access rather than returning null, so every read and write is guarded and
 * falls back to "system".
 */

export type Theme = "light" | "dark" | "system";

const KEY = "ims.theme";

function read(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/* Applied before React mounts, so the first paint is already the right colour
 * and nobody sees a white flash on the way to a dark screen. */
apply(read());

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    apply(theme);
    try {
      if (theme === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      // A preference that cannot be saved is still worth honouring this session.
    }
  }, [theme]);

  return { theme, setTheme };
}
