import { Search, X } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { Field } from "./ui";

/**
 * The furniture around a list.
 *
 * Every list screen in the app narrows the same way — type something, pick a
 * status, pick a location — and each was writing that out by hand, so the
 * search box on one screen had an icon and on the next it did not, and a status
 * filter was a select on twelve screens and a segmented control on one.
 *
 * The stylesheet already described all of this. These are the components that
 * finally wear it.
 */

/* ================================================================== search */

/**
 * A search box that looks like one.
 *
 * The magnifier is not decoration: a row of four identical select-shaped
 * controls gives the eye nothing to aim at, and the one the user almost always
 * wants first is the text field. The clear button matters more — a filter that
 * cannot be seen to be on, and cannot be turned off without selecting the text
 * and deleting it, is how a list ends up looking empty for no visible reason.
 */
export function SearchField({
  label = "Search",
  value,
  onChange,
  placeholder,
  wide,
  ...props
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Takes the remaining width of the filter row. */
  wide?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className={wide ? "field wide" : "field"}>
      <label>{label}</label>
      <div className="input-icon">
        <Search size={14} aria-hidden />
        <input
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          {...props}
        />
      </div>
    </div>
  );
}

/* ====================================================== segmented control */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Shown after the label, when the screen knows how many are in each bucket. */
  count?: number;
}

/**
 * A filter with few enough options to show them all.
 *
 * A select hides the choices and costs two clicks and a read. This costs one
 * click and says what the alternatives are without being opened — which for a
 * status filter is the whole question. Worth it up to about five options; past
 * that it is a select.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="field">
      {label ? <label>{label}</label> : null}
      <div className="seg" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === value ? "active" : undefined}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="count">{option.count}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ========================================================== active filters */

export interface ActiveFilter {
  /** The field, so a bare value like "Dairy" is not a mystery. */
  key: string;
  value: string;
  /** Restores this one filter to its default. */
  onClear: () => void;
}

/**
 * What is currently being hidden, and how to stop hiding it.
 *
 * Without this a list showing 12 of 4,318 products looks exactly like a
 * catalogue of 12 products, and the only way to find out why is to scroll back
 * up and read four controls. The chips state it in words and carry their own
 * undo, so the answer and the fix are in the same place.
 *
 * Renders nothing when nothing is filtered — a permanent "no filters applied"
 * row is furniture that never says anything.
 */
export function ActiveFilters({
  filters,
  onClearAll,
  total,
  showing,
  noun = "results",
}: {
  filters: ActiveFilter[];
  onClearAll?: () => void;
  /** Shows "12 of 4,318" when the screen knows the unfiltered total. */
  total?: number | null;
  showing?: number;
  noun?: string;
}) {
  const active = filters.filter((filter) => filter.value);
  if (active.length === 0 && total === undefined) return null;

  return (
    <div className="active-filters">
      {active.length > 0 ? (
        <>
          <span>Filtered by</span>
          {active.map((filter) => (
            <span className="filter-chip" key={`${filter.key}-${filter.value}`}>
              <span className="key">{filter.key}</span>
              <span className="val">{filter.value}</span>
              <button
                type="button"
                onClick={filter.onClear}
                aria-label={`Clear ${filter.key} filter`}
                title={`Clear ${filter.key} filter`}
              >
                <X size={11} aria-hidden />
              </button>
            </span>
          ))}
          {active.length > 1 && onClearAll ? (
            <button type="button" className="ghost sm" onClick={onClearAll}>
              Clear all
            </button>
          ) : null}
        </>
      ) : null}

      {total !== undefined && total !== null && showing !== undefined ? (
        <span className="filter-count" style={{ marginLeft: "auto" }}>
          Showing <strong>{showing.toLocaleString("en-IN")}</strong> of{" "}
          <strong>{total.toLocaleString("en-IN")}</strong> {noun}
        </span>
      ) : null}
    </div>
  );
}

/* =============================================================== date range */

/**
 * From and to, side by side.
 *
 * Six screens wrote this pair out by hand, and three of them let you pick a
 * "from" after the "to" — which returns an empty report and looks like a system
 * with no data in it. The min/max attributes make that unreachable.
 */
export function DateRange({
  from,
  to,
  onFrom,
  onTo,
  label = "Period",
}: {
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  label?: string;
}) {
  return (
    <>
      <Field label={`${label} from`}>
        <input type="date" value={from} max={to || undefined} onChange={(e) => onFrom(e.target.value)} />
      </Field>
      <Field label="to">
        <input type="date" value={to} min={from || undefined} onChange={(e) => onTo(e.target.value)} />
      </Field>
    </>
  );
}

/**
 * A row of filters.
 *
 * Exists so the class name is in one place rather than fifteen, and so a screen
 * that wants a trailing action ("Reset", "Export") has somewhere to put it that
 * lines up with the controls rather than with their labels.
 */
export function FilterBar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="filters">
      {children}
      {actions ? <div className="btn-row">{actions}</div> : null}
    </div>
  );
}
