import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium '
  + 'ring-1 ring-inset [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-sunken text-ink-secondary ring-line',
        brand: 'bg-brand-subtle text-brand-ink ring-brand/20',
        /*
         * Status tones always ship beside an icon or a text label, never as
         * colour alone — and the TEXT uses the `-ink` step, which is the one
         * validated for 4.5:1. The bare token is a mark-grade fill and was
         * measuring 1.79:1 as amber text.
         */
        good: 'bg-good-subtle text-good-ink ring-good/25',
        warning: 'bg-warning-subtle text-warning-ink ring-warning/30',
        serious: 'bg-warning-subtle text-warning-ink ring-warning/30',
        critical: 'bg-critical-subtle text-critical-ink ring-critical/25',
        info: 'bg-accent-subtle text-accent ring-accent/25',
      },
      size: {
        sm: 'text-2xs',
        md: 'px-2 py-0.5 text-xs',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'sm' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

export { badgeVariants };
