import type { ReactNode } from 'react';

/**
 * Shared settings-pane primitives.
 *
 * These live in one place because four panes were each hand-rolling their own
 * switch: the geometry, the checked tint and the focus treatment had all drifted
 * apart, so the same control looked like three different controls depending on
 * which tab you were on.
 */

/** A hairline that reads as a seam in the material rather than a drawn line. */
export const Divider = () => (
  <div aria-hidden="true" className="h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />
);

type SettingRowProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export const SettingRow = ({ title, description, children }: SettingRowProps) => (
  <div className="flex items-center justify-between gap-6 py-4">
    <div className="min-w-0">
      <h3 className="text-sm font-semibold tracking-tight text-ink">{title}</h3>
      <p className="mt-0.5 text-sm font-normal text-ink-soft">{description}</p>
    </div>
    <div className="flex shrink-0 items-center">{children}</div>
  </div>
);

type ToggleProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

/**
 * A physical switch: a graphite knob riding in a channel pressed into the canvas.
 * The checkbox itself stays in the DOM (visually hidden) so keyboard and assistive
 * technology semantics are untouched.
 *
 * Focus uses an offset outline rather than an inset ring so it matches the global
 * `:focus-visible` rule in Options.css — an inset ring would be swallowed by the
 * channel's own inset shadow.
 */
export const Toggle = ({ id, label, checked, onChange, disabled = false }: ToggleProps) => (
  <div className="relative inline-flex items-center">
    <input
      id={id}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={e => onChange(e.target.checked)}
      className="peer sr-only"
    />
    <label
      htmlFor={id}
      className={`relative block h-7 w-12 rounded-pill bg-canvas-sunk shadow-neu-inset transition-colors duration-150 ease-press after:absolute after:left-1 after:top-1 after:size-5 after:rounded-pill after:bg-graphite after:shadow-key-sm after:transition-transform after:duration-150 after:ease-press after:content-[''] peer-checked:bg-signal-ok/20 peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink/60 ${
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'
      }`}>
      <span className="sr-only">{label}</span>
    </label>
  </div>
);
