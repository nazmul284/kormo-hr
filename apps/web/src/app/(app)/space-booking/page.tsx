'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarPlus, ChevronLeft, ChevronRight, DoorOpen, Monitor, Users, X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { FilterBar } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select } from '@/components/ui/input';
import { SegmentedTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn, countOf, formatDate, formatTime, WEEKDAYS_SHORT } from '@/lib/utils';

interface Room {
  id: number;
  name: string;
  floor: string | null;
  capacity: number;
  amenities: string[];
  colorHex: string | null;
  openTime: string;
  closeTime: string;
  location: { id: number; name: string } | null;
}

interface Booking {
  id: number;
  title: string;
  agenda: string | null;
  startAt: string;
  endAt: string;
  status: string;
  seriesId: string | null;
  isRecurring: boolean;
  organiser: { id: number; fullName: string; initials: string; avatarUrl: string | null };
  attendeeCount: number;
  attendees: { id: number; fullName: string; response: string }[];
  externalGuests: string[];
  isMine: boolean;
  amInvited: boolean;
  durationMinutes: number;
}

const HOURS = Array.from({ length: 14 }, (_, index) => index + 8); // 08:00 – 21:00

export default function SpaceBookingPage() {
  const { can } = useSession();
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [roomFilter, setRoomFilter] = useState<number[]>([]);
  const [booking, setBooking] = useState<{ roomId: number; startAt: string } | null>(null);

  const rooms = useQuery({
    queryKey: ['booking', 'rooms'],
    queryFn: () => api.get<Room[]>('/booking/rooms'),
  });

  const grid = useQuery({
    queryKey: ['booking', 'grid', view, date, roomFilter.join(',')],
    queryFn: () =>
      api.get<{ view: string; from: string; to: string; rooms: (Room & { bookings: Booking[] })[] }>(
        '/booking/grid',
        {
          view,
          date,
          roomIds: roomFilter.length > 0 ? roomFilter.join(',') : undefined,
        },
      ),
  });

  function step(delta: number) {
    const current = new Date(`${date}T12:00:00Z`);
    const days = view === 'day' ? 1 : view === 'week' ? 7 : 30;
    current.setUTCDate(current.getUTCDate() + delta * days);
    setDate(current.toISOString().slice(0, 10));
  }

  return (
    <>
      <PageHeader
        title="Room booking"
        description="Rooms as columns, hours as rows. Conflicts are rejected server-side, so two people cannot book the same slot."
        breadcrumbs={[{ label: 'Workplace' }, { label: 'Room Booking' }]}
        actions={
          can('booking.create') ? (
            <Button onClick={() => setBooking({ roomId: rooms.data?.[0]?.id ?? 0, startAt: '' })}>
              <CalendarPlus />
              New booking
            </Button>
          ) : null
        }
      />

      <FilterBar
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon-sm" onClick={() => step(-1)} aria-label="Previous">
              <ChevronLeft />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDate(new Date().toISOString().slice(0, 10))}
            >
              Today
            </Button>
            <Button variant="secondary" size="icon-sm" onClick={() => step(1)} aria-label="Next">
              <ChevronRight />
            </Button>
          </div>
        }
      >
        <Field label="Date">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <div className="pb-0.5">
          <SegmentedTabs
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
        </div>
        {(rooms.data?.length ?? 0) > 0 ? (
          <Field label="Rooms">
            <div className="flex flex-wrap gap-1.5">
              {rooms.data!.map((room) => {
                const active = roomFilter.length === 0 || roomFilter.includes(room.id);
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() =>
                      setRoomFilter((current) =>
                        current.includes(room.id)
                          ? current.filter((id) => id !== room.id)
                          : [...current, room.id],
                      )
                    }
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-2 py-1 text-2xs font-medium transition-colors',
                      active && roomFilter.includes(room.id)
                        ? 'border-brand bg-brand-subtle text-brand-ink'
                        : 'border-line text-ink-secondary hover:bg-surface-sunken',
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-2 rounded-sm"
                      style={{ backgroundColor: room.colorHex ?? 'rgb(var(--brand))' }}
                    />
                    {room.name}
                  </button>
                );
              })}
              {roomFilter.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setRoomFilter([])}
                  className="flex items-center gap-1 rounded-full border border-line px-2 py-1 text-2xs text-ink-muted hover:bg-surface-sunken"
                >
                  <X className="size-3" aria-hidden />
                  clear
                </button>
              ) : null}
            </div>
          </Field>
        ) : null}
      </FilterBar>

      {grid.isLoading ? (
        <div className="h-96 skeleton rounded-card" />
      ) : (grid.data?.rooms.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={DoorOpen}
            title="No bookable rooms"
            description="Ask admin to add meeting rooms for your location."
          />
        </Card>
      ) : view === 'day' ? (
        <DayGrid
          rooms={grid.data!.rooms}
          date={date}
          onBook={(roomId, startAt) => setBooking({ roomId, startAt })}
          canBook={can('booking.create')}
        />
      ) : (
        <ListView rooms={grid.data!.rooms} from={grid.data!.from} to={grid.data!.to} />
      )}

      <MyBookings />

      <NewBookingDialog
        rooms={rooms.data ?? []}
        seed={booking}
        onClose={() => setBooking(null)}
      />
    </>
  );
}

function DayGrid({
  rooms,
  date,
  onBook,
  canBook,
}: {
  rooms: (Room & { bookings: Booking[] })[];
  date: string;
  onBook: (roomId: number, startAt: string) => void;
  canBook: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{formatDate(date, 'long')}</CardTitle>
        <p className="mt-0.5 text-xs text-ink-muted">
          Hourly slots. A free cell offers “Book now”; a booked cell shows who has it.
        </p>
      </CardHeader>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-20 border-b border-r border-line bg-surface-sunken
                             px-2 py-2 text-left text-2xs font-semibold uppercase text-ink-secondary">
                Time
              </th>
              {rooms.map((room) => (
                <th
                  key={room.id}
                  className="min-w-40 border-b border-l border-line bg-surface-sunken px-2 py-2 text-left"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: room.colorHex ?? 'rgb(var(--brand))' }}
                    />
                    <span className="truncate text-xs font-semibold text-ink">{room.name}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-2xs font-normal text-ink-muted">
                    <span className="flex items-center gap-0.5">
                      <Users className="size-2.5" aria-hidden />
                      {room.capacity}
                    </span>
                    {room.floor ? <span>{room.floor} floor</span> : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((hour) => (
              <tr key={hour}>
                <td className="sticky left-0 z-10 border-b border-r border-line bg-surface px-2 py-1.5
                               align-top text-2xs text-ink-muted tabular">
                  {String(hour).padStart(2, '0')}:00
                </td>
                {rooms.map((room) => {
                  const slotStart = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+06:00`);
                  const slotEnd = new Date(slotStart.getTime() + 3_600_000);
                  const hit = room.bookings.find(
                    (b) => new Date(b.startAt) < slotEnd && new Date(b.endAt) > slotStart,
                  );
                  // Only render the block in its first slot, then span it.
                  const isFirstSlot =
                    hit && new Date(hit.startAt).getTime() >= slotStart.getTime() - 3_599_000;

                  return (
                    <td
                      key={room.id}
                      className="h-12 border-b border-l border-line p-0.5 align-top"
                    >
                      {hit ? (
                        isFirstSlot ? (
                          <div
                            className="h-full min-h-[2.5rem] overflow-hidden rounded px-1.5 py-1"
                            style={{
                              backgroundColor: `color-mix(in srgb, ${room.colorHex ?? 'rgb(var(--brand))'} 14%, transparent)`,
                              borderLeft: `2px solid ${room.colorHex ?? 'rgb(var(--brand))'}`,
                            }}
                            title={`${hit.title} · ${formatTime(hit.startAt)}–${formatTime(hit.endAt)} · ${hit.organiser.fullName}`}
                          >
                            <p className="truncate text-2xs font-semibold text-ink">{hit.title}</p>
                            <p className="truncate text-2xs text-ink-muted">
                              {formatTime(hit.startAt)}–{formatTime(hit.endAt)}
                            </p>
                            <p className="truncate text-2xs text-ink-muted">
                              {hit.organiser.fullName}
                              {hit.attendeeCount > 0 ? ` +${hit.attendeeCount}` : ''}
                            </p>
                          </div>
                        ) : (
                          <div
                            className="h-full min-h-[2.5rem] rounded"
                            style={{
                              backgroundColor: `color-mix(in srgb, ${room.colorHex ?? 'rgb(var(--brand))'} 8%, transparent)`,
                              borderLeft: `2px solid ${room.colorHex ?? 'rgb(var(--brand))'}`,
                            }}
                            aria-hidden
                          />
                        )
                      ) : canBook ? (
                        <button
                          type="button"
                          onClick={() =>
                            onBook(room.id, `${date}T${String(hour).padStart(2, '0')}:00`)
                          }
                          aria-label={`Book ${room.name} at ${String(hour).padStart(2, '0')}:00`}
                          /*
                           * A free cell keeps a faint affordance instead of being
                           * fully transparent — on a sparse day an all-blank grid
                           * reads as broken rather than available.
                           */
                          className="group flex h-full min-h-[2.5rem] w-full items-center justify-center
                                     rounded text-2xs text-ink-muted/50 transition-colors
                                     hover:bg-brand-subtle hover:text-brand"
                        >
                          <span className="opacity-60 group-hover:hidden">+</span>
                          <span className="hidden whitespace-nowrap group-hover:inline">
                            + Book now
                          </span>
                        </button>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ListView({
  rooms,
  from,
  to,
}: {
  rooms: (Room & { bookings: Booking[] })[];
  from: string;
  to: string;
}) {
  const all = rooms
    .flatMap((room) => room.bookings.map((booking) => ({ ...booking, room })))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const byDay = all.reduce<Record<string, typeof all>>((acc, booking) => {
    const key = booking.startAt.slice(0, 10);
    acc[key] = [...(acc[key] ?? []), booking];
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {formatDate(from)} – {formatDate(to)}
        </CardTitle>
        <p className="mt-0.5 text-xs text-ink-muted">{countOf(all.length, 'booking')} in this window</p>
      </CardHeader>

      {all.length === 0 ? (
        <EmptyState title="No bookings in this window" />
      ) : (
        <div className="divide-y divide-line">
          {Object.entries(byDay).map(([day, bookings]) => (
            <div key={day} className="px-4 py-3">
              <p className="mb-2 text-xs font-semibold text-ink">
                {formatDate(day, 'long')}
                <span className="ml-2 font-normal text-ink-muted">
                  {WEEKDAYS_SHORT[new Date(`${day}T12:00:00Z`).getUTCDay()]}
                </span>
              </p>
              <ul className="space-y-1.5">
                {bookings.map((booking) => (
                  <li
                    key={booking.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2.5 py-2"
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: booking.room.colorHex ?? 'rgb(var(--brand))' }}
                    />
                    <span className="text-2xs text-ink-muted tabular">
                      {formatTime(booking.startAt)}–{formatTime(booking.endAt)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                      {booking.title}
                    </span>
                    <Badge tone="neutral">{booking.room.name}</Badge>
                    {booking.isRecurring ? <Badge tone="info">recurring</Badge> : null}
                    <span className="text-2xs text-ink-muted">{booking.organiser.fullName}</span>
                    {booking.attendees.length > 0 ? (
                      <AvatarStack people={booking.attendees} max={3} size="xs" />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function MyBookings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['booking', 'mine'],
    queryFn: () =>
      api.get<
        (Booking & {
          room: { id: number; name: string; floor: string | null; capacity: number };
          myResponse: string | null;
        })[]
      >('/booking/mine'),
  });

  const cancel = useMutation({
    mutationFn: ({ id, wholeSeries }: { id: number; wholeSeries: boolean }) =>
      api.patch(`/booking/${id}/cancel`, { wholeSeries }),
    onSuccess: () => {
      toast.success('Booking cancelled');
      void queryClient.invalidateQueries({ queryKey: ['booking'] });
    },
    onError: (error) => {
      toast.error('Could not cancel', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: number; accept: boolean }) =>
      api.patch(`/booking/${id}/respond`, { accept }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['booking'] });
    },
  });

  if (!data || data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>My upcoming bookings</CardTitle>
      </CardHeader>
      <ul className="divide-y divide-line">
        {data.slice(0, 12).map((booking) => (
          <li key={booking.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
                {booking.title}
                {booking.isRecurring ? <Badge tone="info">recurring</Badge> : null}
                {booking.isMine ? <Badge tone="brand">organiser</Badge> : null}
              </p>
              <p className="mt-0.5 text-2xs text-ink-muted">
                {formatDate(booking.startAt)} · {formatTime(booking.startAt)}–{formatTime(booking.endAt)} ·{' '}
                {booking.room.name}
                {booking.room.floor ? ` (${booking.room.floor} floor)` : ''}
              </p>
            </div>

            {booking.attendees.length > 0 ? (
              <AvatarStack people={booking.attendees} max={4} size="xs" />
            ) : null}

            {booking.isMine ? (
              <div className="flex gap-1.5">
                <Button
                  variant="danger-outline"
                  size="sm"
                  onClick={() => cancel.mutate({ id: booking.id, wholeSeries: false })}
                  loading={cancel.isPending}
                >
                  Cancel
                </Button>
                {booking.isRecurring ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cancel.mutate({ id: booking.id, wholeSeries: true })}
                  >
                    Cancel series
                  </Button>
                ) : null}
              </div>
            ) : booking.myResponse === 'PENDING' ? (
              <div className="flex gap-1.5">
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => respond.mutate({ id: booking.id, accept: true })}
                >
                  Accept
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => respond.mutate({ id: booking.id, accept: false })}
                >
                  Decline
                </Button>
              </div>
            ) : (
              <Badge tone={booking.myResponse === 'APPROVED' ? 'good' : 'neutral'}>
                {booking.myResponse === 'APPROVED' ? 'accepted' : 'declined'}
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function NewBookingDialog({
  rooms,
  seed,
  onClose,
}: {
  rooms: Room[];
  seed: { roomId: number; startAt: string } | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [roomId, setRoomId] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [duration, setDuration] = useState(60);
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [recurring, setRecurring] = useState(false);
  const [occurrences, setOccurrences] = useState(4);

  const directory = useQuery({
    queryKey: ['directory', 'booking-attendees'],
    queryFn: () =>
      api.get<{ data: { id: number; fullName: string; initials: string; designation: { name: string } | null }[] }>(
        '/employees/directory',
        { pageSize: 100 },
      ),
    enabled: seed !== null,
  });

  useMemo(() => {
    if (!seed) return;
    setRoomId(String(seed.roomId || rooms[0]?.id || ''));
    if (seed.startAt) {
      setDate(seed.startAt.slice(0, 10));
      setStartTime(seed.startAt.slice(11, 16));
    } else {
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [seed, rooms]);

  const room = rooms.find((entry) => String(entry.id) === roomId);
  const overCapacity = room ? attendeeIds.length + 1 > room.capacity : false;

  const submit = useMutation({
    mutationFn: () => {
      const startAt = new Date(`${date}T${startTime}:00+06:00`);
      const endAt = new Date(startAt.getTime() + duration * 60_000);
      return api.post('/booking', {
        roomId: Number(roomId),
        title,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        attendeeIds,
        recurrence: recurring ? { freq: 'WEEKLY', count: occurrences } : undefined,
      });
    },
    onSuccess: (result: any) => {
      toast.success(
        result.created > 1 ? `${result.created} bookings created` : 'Room booked',
      );
      void queryClient.invalidateQueries({ queryKey: ['booking'] });
      setTitle('');
      setAttendeeIds([]);
      setRecurring(false);
      onClose();
    },
    onError: (error) => {
      toast.error('Could not book the room', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  return (
    <Dialog open={seed !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>New booking</DialogTitle>
          <DialogDescription>
            Conflicts are checked against every occurrence, so a recurring series that collides on
            any date is rejected as a whole.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <Field label="Room" required>
            <Select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
              {rooms.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} — seats {entry.capacity}
                  {entry.floor ? ` (${entry.floor} floor)` : ''}
                </option>
              ))}
            </Select>
          </Field>

          {room && room.amenities.length > 0 ? (
            <p className="flex flex-wrap items-center gap-1.5">
              <Monitor className="size-3.5 text-ink-muted" aria-hidden />
              {room.amenities.map((amenity) => (
                <Badge key={amenity} tone="neutral">{amenity}</Badge>
              ))}
            </p>
          ) : null}

          <Field label="Title" required>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Sprint planning"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Date" required>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
            <Field label="Start" required>
              <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </Field>
            <Field label="Duration" required>
              <Select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                {[30, 60, 90, 120, 180].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="Attendees"
            hint={
              room
                ? `${attendeeIds.length + 1} of ${room.capacity} seats`
                : undefined
            }
            error={overCapacity ? `${room?.name} only seats ${room?.capacity}.` : undefined}
          >
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
              {(directory.data?.data ?? []).map((person) => {
                const selected = attendeeIds.includes(String(person.id));
                return (
                  <label
                    key={person.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-surface-sunken"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        setAttendeeIds((current) =>
                          selected
                            ? current.filter((id) => id !== String(person.id))
                            : [...current, String(person.id)],
                        )
                      }
                      className="size-3.5 rounded border-line text-brand focus:ring-brand"
                    />
                    <Avatar name={person.fullName} initials={person.initials} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-xs text-ink">{person.fullName}</span>
                    <span className="shrink-0 truncate text-2xs text-ink-muted">
                      {person.designation?.name ?? ''}
                    </span>
                  </label>
                );
              })}
            </div>
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(event) => setRecurring(event.target.checked)}
              className="size-4 rounded border-line text-brand focus:ring-brand"
            />
            <span className="text-ink-secondary">Repeat weekly</span>
          </label>

          {recurring ? (
            <Field label="Number of occurrences" required>
              <Input
                type="number"
                min={2}
                max={52}
                value={occurrences}
                onChange={(event) => setOccurrences(Number(event.target.value))}
              />
            </Field>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => submit.mutate()}
            loading={submit.isPending}
            disabled={!roomId || title.trim().length < 3 || !date || overCapacity}
          >
            <CalendarPlus />
            Book room
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
