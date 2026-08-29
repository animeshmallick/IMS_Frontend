import { Command } from "cmdk";
import { Monitor, Moon, Search, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../lib/theme";

/**
 * Jump anywhere with ⌘K.
 *
 * Twenty-four navigation entries is past the point where a sidebar is scanned
 * rather than read, and the people using this all day know where they are
 * going before the page loads. Typing three letters beats hunting a list, and
 * it costs nothing to the people who never find it.
 *
 * Deliberately navigation and preferences only — no destructive actions. A
 * palette that can post a receipt is a palette that posts one by accident.
 */

export type PaletteItem = { to: string; label: string; group: string };

const OPEN_EVENT = "ims:open-palette";

/**
 * Open the palette from anywhere — the topbar button uses this.
 *
 * A custom event rather than dispatching a synthetic ⌘K: faking a keystroke
 * works until something else listens for one, and it lies about what happened.
 */
export function openCommandPalette(): void {
  document.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    document.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  const groups = [...new Set(items.map((item) => item.group))];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="palette"
      overlayClassName="modal-backdrop"
      contentClassName="palette-shell"
    >
      <div className="palette-input">
        <Search size={15} aria-hidden />
        <Command.Input placeholder="Go to…" autoFocus />
        <kbd>esc</kbd>
      </div>

      <Command.List>
        <Command.Empty className="palette-empty">Nothing matches that.</Command.Empty>

        {groups.map((group) => (
          <Command.Group key={group} heading={group}>
            {items
              .filter((item) => item.group === group)
              .map((item) => (
                <Command.Item
                  key={item.to}
                  value={`${item.label} ${item.group}`}
                  onSelect={() => go(item.to)}
                >
                  {item.label}
                  <span className="palette-hint">{item.group}</span>
                </Command.Item>
              ))}
          </Command.Group>
        ))}

        <Command.Group heading="Appearance">
          {(
            [
              ["light", "Light", Sun],
              ["dark", "Dark", Moon],
              ["system", "Match system", Monitor],
            ] as const
          ).map(([value, label, Icon]) => (
            <Command.Item
              key={value}
              value={`theme ${label}`}
              onSelect={() => {
                setTheme(value);
                setOpen(false);
              }}
            >
              <Icon size={14} aria-hidden />
              {label}
              {theme === value ? <span className="palette-hint">Current</span> : null}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
