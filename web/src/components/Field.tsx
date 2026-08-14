import { useId, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from "react";

/**
 * Form pieces, not a form library.
 *
 * Every form here is two to six fields validated by the server, so react-hook-form
 * would add a dependency and an abstraction to save nothing. What is worth
 * sharing is the label markup and the id wiring, because that is what gets
 * skipped when a form is written in a hurry.
 */

export function Field({
  label,
  hint,
  error,
  className = "",
  ...props
}: { label: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="mb-5">
      <label className="label mb-1 block" htmlFor={id}>
        {label}
      </label>
      <input id={id} className={`field ${className}`} aria-invalid={!!error} {...props} />
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs text-accent">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  className = "",
  ...props
}: { label: string; hint?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="mb-5">
      <label className="label mb-1 block" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className={`w-full rounded-card border border-hairline bg-transparent p-3 text-sm outline-none
                    placeholder:text-faint focus:border-accent ${className}`}
        {...props}
      />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Select({
  label,
  children,
  className = "",
  ...props
}: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className="mb-5">
      <label className="label mb-1 block" htmlFor={id}>
        {label}
      </label>
      <select id={id} className={`field ${className}`} {...props}>
        {children}
      </select>
    </div>
  );
}

/** A labelled on/off control. aria-pressed rather than a checkbox: it acts immediately. */
export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-hairline py-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40
                    ${checked ? "bg-accent" : "bg-paper-deep border border-hairline"}`}
      >
        <span
          className={`absolute top-1 size-4 rounded-full bg-white transition-all
                      ${checked ? "left-6" : "left-1"}`}
        />
      </button>
    </div>
  );
}

export function SubmitRow({
  submitLabel,
  pending,
  onCancel,
  disabled = false,
}: {
  submitLabel: string;
  pending?: boolean;
  onCancel?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <button
        type="submit"
        disabled={pending || disabled}
        className="btn-gradient rounded-card px-5 py-2.5 font-medium"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-card border border-hairline px-5 py-2.5 text-muted transition hover:text-ink"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
