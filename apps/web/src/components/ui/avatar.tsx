import { cn, avatarTone, initialsOf } from '@/lib/utils';

/**
 * Initials-based avatar.
 *
 * There is deliberately no per-employee image request here: the org
 * chart in the system being replaced fired roughly forty separate
 * `/img/*` requests on a single page. When a real photo exists it is
 * passed in explicitly and rendered as one image.
 */
const TONES = [
  'bg-series-1/12 text-series-1 ring-series-1/20',
  'bg-series-2/12 text-series-2 ring-series-2/20',
  'bg-series-3/12 text-series-3 ring-series-3/20',
  'bg-series-4/15 text-series-4 ring-series-4/25',
  'bg-series-5/12 text-series-5 ring-series-5/20',
];

const SIZES = {
  xs: 'size-6 text-2xs',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
  xl: 'size-20 text-2xl',
};

export function Avatar({
  name,
  src,
  initials,
  size = 'md',
  className,
}: {
  name?: string | null;
  src?: string | null;
  initials?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const label = initials ?? initialsOf(name);
  const tone = TONES[avatarTone(name)];

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? 'Employee'}
        className={cn('shrink-0 rounded-full object-cover ring-1 ring-line', SIZES[size], className)}
        loading="lazy"
      />
    );
  }

  return (
    <span
      aria-hidden
      title={name ?? undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-1',
        SIZES[size],
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Overlapping stack for attendee lists, capped with a +N chip. */
export function AvatarStack({
  people,
  max = 4,
  size = 'sm',
}: {
  people: { fullName: string; initials?: string; avatarUrl?: string | null }[];
  max?: number;
  size?: keyof typeof SIZES;
}) {
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <div className="flex items-center">
      {shown.map((person, index) => (
        <span
          key={`${person.fullName}-${index}`}
          className="-ml-1.5 rounded-full ring-2 ring-surface first:ml-0"
        >
          <Avatar
            name={person.fullName}
            initials={person.initials}
            src={person.avatarUrl}
            size={size}
          />
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className={cn(
            '-ml-1.5 inline-flex items-center justify-center rounded-full bg-surface-sunken '
            + 'font-medium text-ink-secondary ring-2 ring-surface',
            SIZES[size],
          )}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
