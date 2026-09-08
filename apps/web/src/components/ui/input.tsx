'use client';

import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

const FIELD = 'h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink '
  + 'placeholder:text-ink-muted shadow-sm transition-colors focus:border-brand focus:outline-none '
  + 'focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:bg-surface-sunken '
  + 'disabled:text-ink-muted';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(FIELD, className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(FIELD, 'h-auto min-h-20 resize-y py-2 leading-relaxed', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

/** Native select — keyboard and mobile behaviour for free. */
export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      FIELD,
      'cursor-pointer appearance-none bg-[length:16px] bg-[right_0.5rem_center] bg-no-repeat pr-8',
      className,
    )}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
    }}
    {...props}
  />
));
Select.displayName = 'Select';

export function Label({
  className,
  required,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn('block text-xs font-medium text-ink-secondary', className)} {...props}>
      {children}
      {required ? <span className="ml-0.5 text-critical-ink">*</span> : null}
    </label>
  );
}

export function Field({
  label,
  required,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-critical-ink" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Textarea with a live character counter, for the 255-char reason fields. */
export const CountedTextarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { maxLength: number; value: string }
>(({ className, maxLength, value, ...props }, ref) => {
  const used = value?.length ?? 0;
  const nearLimit = used > maxLength * 0.9;
  return (
    <div className="space-y-1">
      <Textarea ref={ref} className={className} maxLength={maxLength} value={value} {...props} />
      <p
        className={cn(
          'text-right text-2xs tabular',
          nearLimit ? 'text-serious' : 'text-ink-muted',
        )}
      >
        {used} / {maxLength}
      </p>
    </div>
  );
});
CountedTextarea.displayName = 'CountedTextarea';
