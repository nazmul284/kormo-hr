import { formatMoney } from '@kormo/shared';
import type { Room } from '@prisma/client';

import type { OrgResult } from './org';
import {
  DEMO, PACK, TODAY, addDays, atTime, chance, d, eachDay, iso, isWeekend, log,
  phone, pick, pickN, prisma, randInt, round2, salary, section,
} from './lib';

/** Food programme, room booking, notices, policies, notifications, helpdesk. */
export async function seedWorkplace(org: OrgResult): Promise<void> {
  // ══ food management ════════════════════════════════════════════════
  section('Food management');

  const program = await prisma.foodProgram.create({
    data: {
      companyId: org.primaryCompanyId,
      name: 'Kormo Lunch Management',
      selfCost: salary(40),      // employee's subsidised share
      guestCost: salary(180),    // full chargeable rate
      cancelCutoff: '09:30',
    },
  });

  // Rotating weekly menu. Friday is the weekend, so no menu.
  const WEEKLY_MENU: Record<number, { item: string; qty: string }[]> = {
    0: [{ item: 'Steamed Rice', qty: '1 plate' }, { item: 'Chicken Curry', qty: '1 pc' }, { item: 'Daal', qty: '1 bowl' }, { item: 'Mixed Vegetable', qty: '1 serving' }, { item: 'Salad', qty: '1 serving' }],
    1: [{ item: 'Steamed Rice', qty: '1 plate' }, { item: 'Rui Fish Curry', qty: '1 pc' }, { item: 'Daal', qty: '1 bowl' }, { item: 'Begun Bhaji', qty: '1 serving' }, { item: 'Salad', qty: '1 serving' }],
    2: [{ item: 'Khichuri', qty: '1 plate' }, { item: 'Beef Bhuna', qty: '1 serving' }, { item: 'Egg Curry', qty: '1 pc' }, { item: 'Achar', qty: '1 serving' }],
    3: [{ item: 'Steamed Rice', qty: '1 plate' }, { item: 'Chicken Roast', qty: '1 pc' }, { item: 'Daal', qty: '1 bowl' }, { item: 'Potato Bhorta', qty: '1 serving' }, { item: 'Salad', qty: '1 serving' }],
    4: [{ item: 'Biryani', qty: '1 plate' }, { item: 'Borhani', qty: '1 glass' }, { item: 'Firni', qty: '1 bowl' }, { item: 'Salad', qty: '1 serving' }],
    6: [{ item: 'Fried Rice', qty: '1 plate' }, { item: 'Chilli Chicken', qty: '1 serving' }, { item: 'Vegetable Soup', qty: '1 bowl' }],
  };

  for (const [dayOfWeek, items] of Object.entries(WEEKLY_MENU)) {
    await prisma.foodMenu.create({
      data: {
        foodProgramId: program.id,
        dayOfWeek: Number(dayOfWeek),
        effectiveFrom: d(`${TODAY.getUTCFullYear()}-01-01`),
        items,
      },
    });
  }
  log('created food programme', `${program.name} — self ${PACK.currency.symbol}${program.selfCost}, guest ${PACK.currency.symbol}${program.guestCost}`);
  log('created rotating weekly menu', `${Object.keys(WEEKLY_MENU).length} day templates`);

  // ── subscriptions ──────────────────────────────────────────────────
  const hoLocationId = org.locations.find((l) => l.alias === 'HO-MAIN')?.id;
  const eligible = org.employees.filter(
    (e) => e.companyId === org.primaryCompanyId && e.locationId === hoLocationId,
  );
  const subscribers = eligible.filter(() => chance(78));
  // A couple have unsubscribed, so the Unsubscribe path has history.
  const unsubscribed = pickN(eligible.filter((e) => !subscribers.includes(e)), 3);

  await prisma.mealSubscription.createMany({
    data: [
      ...subscribers.map((e) => ({
        employeeId: e.id,
        foodProgramId: program.id,
        subscribedAt: addDays(e.joiningDate, randInt(1, 30)),
        isActive: true,
      })),
      ...unsubscribed.map((e) => ({
        employeeId: e.id,
        foodProgramId: program.id,
        subscribedAt: addDays(e.joiningDate, randInt(1, 30)),
        unsubscribedAt: addDays(TODAY, -randInt(20, 120)),
        isActive: false,
      })),
    ],
    skipDuplicates: true,
  });
  log('created meal subscriptions', `${subscribers.length} active, ${unsubscribed.length} unsubscribed`);

  // ── meals over the last 90 days ────────────────────────────────────
  const holidays = await prisma.holiday.findMany({
    where: { companyId: org.primaryCompanyId, isOptional: false },
    select: { startDate: true, endDate: true },
  });
  const holidaySet = new Set<string>();
  for (const h of holidays) for (const day of eachDay(h.startDate, h.endDate)) holidaySet.add(iso(day));

  const mealRows: any[] = [];
  for (const emp of subscribers) {
    for (const day of eachDay(addDays(TODAY, -90), TODAY)) {
      if (day < emp.joiningDate) continue;
      if (isWeekend(day)) continue;
      if (holidaySet.has(iso(day))) continue;

      const menu = WEEKLY_MENU[day.getUTCDay()];
      if (!menu) continue;

      const isToday = iso(day) === iso(TODAY);
      // Today's meal may not have been collected yet — that is the
      // "Not taken Yet" state in the grid.
      const status = isToday
        ? chance(45) ? 'TAKEN' : 'SCHEDULED'
        : chance(6) ? 'CANCELLED' : chance(4) ? 'NOT_TAKEN' : 'TAKEN';

      const guestCount = status === 'TAKEN' && chance(4) ? randInt(1, 2) : 0;

      mealRows.push({
        employeeId: emp.id,
        foodProgramId: program.id,
        date: day,
        status,
        takenAt: status === 'TAKEN' ? atTime(day, '13:00', randInt(-25, 70)) : null,
        menuSnapshot: menu,
        selfCost: ['TAKEN', 'NOT_TAKEN'].includes(status) ? Number(program.selfCost) : 0,
        guestCount,
        guestMealCost: round2(guestCount * Number(program.guestCost)),
        cancelledAt: status === 'CANCELLED' ? atTime(day, '09:00', -randInt(0, 120)) : null,
        cancelReason: status === 'CANCELLED'
          ? pick(['On leave', 'Client lunch off-site', 'Working from home', 'Travelling to the branch'])
          : null,
      });
    }
  }
  for (let i = 0; i < mealRows.length; i += 5_000) {
    await prisma.meal.createMany({ data: mealRows.slice(i, i + 5_000), skipDuplicates: true });
  }
  const mealMix = mealRows.reduce<Record<string, number>>((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});
  log('created meal records', `${mealRows.length} over 90 days`);
  log('meal status mix', Object.entries(mealMix).map(([k, v]) => `${k}:${v}`).join(' '));

  // ══ room booking ═══════════════════════════════════════════════════
  section('Room booking');

  const ROOMS = [
    { name: 'Boardroom', floor: DEMO.floorLabels[4], capacity: 16, amenities: ['Projector', 'VC', 'Whiteboard', 'Speakerphone'], colorHex: '#4F46E5' },
    { name: 'Focus Room A', floor: DEMO.floorLabels[3], capacity: 4, amenities: ['Whiteboard'], colorHex: '#0EA5E9' },
    { name: 'Focus Room B', floor: DEMO.floorLabels[3], capacity: 4, amenities: ['Whiteboard'], colorHex: '#14B8A6' },
    { name: 'Training Room', floor: DEMO.floorLabels[2], capacity: 30, amenities: ['Projector', 'Sound system', 'Whiteboard'], colorHex: '#F59E0B' },
    { name: 'Interview Room', floor: DEMO.floorLabels[2], capacity: 6, amenities: ['VC'], colorHex: '#8B5CF6' },
    { name: 'Huddle Space', floor: DEMO.floorLabels[4], capacity: 8, amenities: ['TV', 'Whiteboard'], colorHex: '#EC4899' },
  ];
  const rooms: Room[] = [];
  for (const spec of ROOMS) {
    rooms.push(
      await prisma.room.create({
        data: {
          ...spec,
          companyId: org.primaryCompanyId,
          locationId: hoLocationId,
          openTime: '08:00',
          closeTime: '21:00',
        },
      }),
    );
  }
  log('created rooms', rooms.length);

  const MEETING_TITLES = [
    'Sprint planning', 'Weekly leadership sync', 'Candidate interview — Software Engineer',
    'Payroll review — month end', 'Product roadmap review', 'Vendor negotiation',
    'New joiner induction', 'Quarterly business review', 'Incident post-mortem',
    'Marketing campaign kickoff', 'One-on-one', 'Design review',
    'Compliance training', 'Territory performance review',
  ];

  const bookingRows: { roomId: number; organiserId: bigint; title: string; startAt: Date; endAt: Date; status: string; attendees: bigint[]; seriesId: string | null }[] = [];
  const organisers = org.employees.filter((e) => e.companyId === org.primaryCompanyId && e.level >= 3);

  // A recurring weekly leadership sync, plus ad-hoc bookings.
  const boardroom = rooms.find((r) => r.name === 'Boardroom')!;
  const md = org.employees.find((e) => e.username === 'md')!;
  const seriesId = 'series-leadership-weekly';
  for (let w = -6; w <= 4; w++) {
    // 10:00 on the first working day of each week, whichever day the
    // tenant's country pack makes that.
    const firstWorkday = PACK.weekendDays.length > 0
      ? (PACK.weekendDays[PACK.weekendDays.length - 1] + 1) % 7
      : 1;
    const base = addDays(TODAY, w * 7);
    const sunday = addDays(base, (firstWorkday - base.getUTCDay() + 7) % 7);
    bookingRows.push({
      roomId: boardroom.id,
      organiserId: md.id,
      title: 'Weekly leadership sync',
      startAt: atTime(sunday, '10:00'),
      endAt: atTime(sunday, '11:30'),
      status: 'CONFIRMED',
      attendees: org.employees.filter((e) => e.level >= 8).map((e) => e.id),
      seriesId,
    });
  }

  // Ad-hoc bookings across a three-week window, with conflict avoidance.
  const occupied = new Map<string, { start: number; end: number }[]>();
  function isFree(roomId: number, start: Date, end: Date): boolean {
    const key = `${roomId}:${iso(start)}`;
    const slots = occupied.get(key) ?? [];
    const overlaps = slots.some((s) => start.getTime() < s.end && end.getTime() > s.start);
    if (overlaps) return false;
    slots.push({ start: start.getTime(), end: end.getTime() });
    occupied.set(key, slots);
    return true;
  }
  // Seed the recurring series into the occupancy map first.
  for (const b of bookingRows) isFree(b.roomId, b.startAt, b.endAt);

  for (const day of eachDay(addDays(TODAY, -14), addDays(TODAY, 14))) {
    if (isWeekend(day)) continue;
    if (holidaySet.has(iso(day))) continue;

    for (let i = 0; i < randInt(3, 9); i++) {
      const room = pick(rooms);
      const startHour = randInt(9, 18);
      const durationMin = pick([30, 60, 60, 90, 120]);
      const startAt = atTime(day, `${String(startHour).padStart(2, '0')}:00`);
      const endAt = new Date(startAt.getTime() + durationMin * 60_000);
      if (!isFree(room.id, startAt, endAt)) continue;

      const organiser = pick(organisers);
      const cancelled = chance(7);
      bookingRows.push({
        roomId: room.id,
        organiserId: organiser.id,
        title: pick(MEETING_TITLES),
        startAt,
        endAt,
        status: cancelled ? 'CANCELLED' : 'CONFIRMED',
        attendees: pickN(
          org.employees.filter((e) => e.id !== organiser.id && e.companyId === org.primaryCompanyId),
          Math.min(room.capacity - 1, randInt(1, 8)),
        ).map((e) => e.id),
        seriesId: null,
      });
    }
  }

  for (const row of bookingRows) {
    const booking = await prisma.roomBooking.create({
      data: {
        roomId: row.roomId,
        organiserId: row.organiserId,
        title: row.title,
        agenda: chance(45) ? `${row.title} — agenda circulated by email.` : null,
        startAt: row.startAt,
        endAt: row.endAt,
        status: row.status as never,
        seriesId: row.seriesId,
        recurrence: row.seriesId ? { freq: 'WEEKLY', byDay: 'SU', interval: 1 } : undefined,
        externalGuests: chance(10) ? ['vendor.rep@external.example'] : [],
        cancelledAt: row.status === 'CANCELLED' ? addDays(row.startAt, -1) : null,
        cancelReason: row.status === 'CANCELLED'
          ? pick(['Organiser on leave', 'Moved to a video call', 'Rescheduled to next week'])
          : null,
      },
    });
    if (row.attendees.length > 0) {
      await prisma.roomBookingAttendee.createMany({
        data: row.attendees.map((employeeId) => ({
          bookingId: booking.id,
          employeeId,
          response: chance(70) ? 'APPROVED' : chance(50) ? 'PENDING' : 'REJECTED',
        })),
        skipDuplicates: true,
      });
    }
  }
  log('created room bookings', `${bookingRows.length} (incl. an 11-week recurring series)`);

  // ══ notices, policies, notifications, helpdesk ═════════════════════
  section('Notices, policies, notifications & help desk');

  const hrAdmin = org.employees.find((e) => e.username === 'hr.admin')!;
  const itAdmin = org.employees.find((e) => e.username === 'admin')!;

  /*
   * Pick the pack's longest holiday in the seeded year for the closure
   * notice, so the notice board reads like the country's own calendar
   * rather than quoting a festival that is not on it.
   */
  const holidayNotice = (PACK.holidays[TODAY.getUTCFullYear()] ?? [])
    .map((h) => ({
      ...h,
      days: Math.round((d(h.end ?? h.start).getTime() - d(h.start).getTime()) / 86_400_000) + 1,
    }))
    .filter((h) => !h.optional)
    .sort((a, b) => b.days - a.days || a.start.localeCompare(b.start))[0];

  /** "24 December" — a notice is prose, so it should not carry ISO dates. */
  const readable = (isoDate: string) =>
    d(isoDate).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long' });

  const closureSpan = holidayNotice
    ? holidayNotice.end && holidayNotice.end !== holidayNotice.start
      ? `from ${readable(holidayNotice.start)} to ${readable(holidayNotice.end)}`
      : `on ${readable(holidayNotice.start)}`
    : 'over the next public holiday';

  const NOTICES = [
    {
      title: `${holidayNotice?.name ?? 'Public holiday'} — closure schedule`,
      body:
        `The office will remain closed ${closureSpan}. The warehouse will run a `
        + 'skeleton dispatch crew for the first two days; those rostered will be '
        + 'granted compensatory leave. Please complete all approvals before the '
        + 'closure begins.',
      isPinned: true, daysAgo: 6,
    },
    {
      title: 'Annual health check-up camp — register by Thursday',
      body: 'Our medical insurance partner is running an on-site health camp on the 7th floor next week. Basic screening, BMI, blood sugar and an optional consultation are included at no cost. Register through the help desk.',
      isPinned: true, daysAgo: 3,
    },
    {
      title: 'Payroll cut-off moved forward by one day',
      body: 'For this month only, the attendance and overtime cut-off is the 25th instead of the 26th. Please clear all pending attendance edit requests and overtime approvals before then, or they will roll into next month\'s payroll.',
      isPinned: false, daysAgo: 11,
    },
    {
      title: 'New leave policy effective from January',
      body: 'Annual leave carry-forward is now capped at 20 days and expires on 30 June of the following year. Casual leave remains non-carry-forwardable. The full policy is available under Office Policy.',
      isPinned: false, daysAgo: 25,
    },
    {
      title: 'Mandatory information-security training',
      body: 'All employees must complete the information-security awareness module by the end of the quarter. The module takes about 40 minutes. Completion is tracked against your onboarding and compliance record.',
      isPinned: false, daysAgo: 34,
    },
    {
      title: 'Office shuttle route change — Mirpur & Uttara',
      body: 'From next Sunday the morning shuttle will use the Airport Road instead of the Mirpur Road due to ongoing construction. Pick-up times move 15 minutes earlier for the Uttara route.',
      isPinned: false, daysAgo: 48,
    },
  ];
  await prisma.notice.createMany({
    data: NOTICES.map((n) => ({
      companyId: org.primaryCompanyId,
      title: n.title,
      body: n.body,
      authorId: hrAdmin.id,
      isPinned: n.isPinned,
      publishAt: addDays(TODAY, -n.daysAgo),
      departmentIds: [],
    })),
  });
  log('created notices', NOTICES.length);

  const POLICIES = [
    { title: 'Employee Handbook', category: 'HR', version: '4.2', summary: 'The complete guide to working here: conduct, benefits, leave, grievance and disciplinary process.', monthsAgo: 2 },
    { title: 'Leave & Attendance Policy', category: 'HR', version: '3.1', summary: 'Leave types and entitlements, application and approval flow, attendance grace, late marking and absence deduction.', monthsAgo: 8 },
    { title: 'Code of Conduct & Ethics', category: 'Code of Conduct', version: '2.0', summary: 'Expected standards of professional behaviour, conflict of interest, anti-bribery and whistleblowing.', monthsAgo: 14, requiresAck: true },
    { title: 'IT Acceptable Use Policy', category: 'IT', version: '2.3', summary: 'Acceptable use of company devices, email, internet and cloud services. Password and MFA requirements.', monthsAgo: 5, requiresAck: true },
    { title: 'Travel & Expense Reimbursement', category: 'Finance', version: '1.8', summary: 'Entitlements by grade, per-diem rates, documentation requirements and claim timelines.', monthsAgo: 3 },
    { title: 'Provident Fund & Gratuity Rules', category: 'Finance', version: '1.4', summary: 'Contribution rates, vesting, nomination and withdrawal on separation.', monthsAgo: 20 },
    { title: 'Workplace Health & Safety', category: 'Safety', version: '1.2', summary: 'Emergency evacuation, first aid, incident reporting and warehouse safety rules.', monthsAgo: 11 },
    { title: 'Anti-Harassment & Grievance Policy', category: 'HR', version: '2.1', summary: 'Zero-tolerance stance, reporting channels, investigation process and protection against retaliation.', monthsAgo: 7, requiresAck: true },
  ];
  await prisma.officePolicy.createMany({
    data: POLICIES.map((p) => ({
      companyId: org.primaryCompanyId,
      title: p.title,
      category: p.category,
      version: p.version,
      summary: p.summary,
      documentPath: `policies/${p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-v${p.version}.pdf`,
      effectiveFrom: addDays(TODAY, -p.monthsAgo * 30),
      isLatest: true,
      requiresAck: p.requiresAck ?? false,
    })),
  });
  log('created office policies', POLICIES.length);

  // ── notifications ──────────────────────────────────────────────────
  // Built from records that actually exist, so every deep link resolves.
  const notificationRows: any[] = [];

  const pendingLeave = await prisma.leaveRequest.findMany({
    where: { status: 'PENDING' },
    select: { id: true, approverId: true, employeeId: true, startDate: true, leaveType: { select: { label: true } }, employee: { select: { firstName: true, lastName: true } } },
    take: 60,
  });
  for (const req of pendingLeave) {
    if (!req.approverId) continue;
    notificationRows.push({
      employeeId: req.approverId,
      kind: 'LEAVE',
      title: `${req.employee.firstName} ${req.employee.lastName} requested ${req.leaveType.label}`,
      body: `Starting ${iso(req.startDate)} — awaiting your approval.`,
      link: '/leave/approval',
      entityType: 'leave_request',
      entityId: String(req.id),
      readAt: chance(35) ? addDays(TODAY, -randInt(0, 3)) : null,
      createdAt: addDays(TODAY, -randInt(0, 9)),
    });
  }

  const recentPayslips = await prisma.payslip.findMany({
    orderBy: { salaryDate: 'desc' },
    select: { id: true, employeeId: true, month: true, year: true, netPayable: true },
    take: 80,
  });
  for (const slip of recentPayslips) {
    notificationRows.push({
      employeeId: slip.employeeId,
      kind: 'PAYROLL',
      title: 'Your payslip is ready',
      body: `Net payable ${formatMoney(Number(slip.netPayable), PACK.currency)} for ${slip.month}/${slip.year}.`,
      link: '/payroll',
      entityType: 'payslip',
      entityId: String(slip.id),
      readAt: chance(60) ? addDays(TODAY, -randInt(0, 5)) : null,
      createdAt: addDays(TODAY, -randInt(1, 12)),
    });
  }

  const openOnboarding = await prisma.onboardingTask.findMany({
    where: { status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] }, assigneeId: { not: null } },
    select: { id: true, assigneeId: true, title: true, employee: { select: { firstName: true, lastName: true } } },
    take: 50,
  });
  for (const task of openOnboarding) {
    notificationRows.push({
      employeeId: task.assigneeId!,
      kind: 'ONBOARDING',
      title: `Onboarding task pending: ${task.title}`,
      body: `For ${task.employee.firstName} ${task.employee.lastName}.`,
      link: '/onboarding',
      entityType: 'onboarding_task',
      entityId: String(task.id),
      readAt: chance(25) ? addDays(TODAY, -randInt(0, 2)) : null,
      createdAt: addDays(TODAY, -randInt(0, 14)),
    });
  }

  // Announcements fan out to everyone.
  for (const emp of org.employees.filter((e) => e.companyId === org.primaryCompanyId)) {
    notificationRows.push({
      employeeId: emp.id,
      kind: 'ANNOUNCEMENT',
      title: `${holidayNotice?.name ?? 'Public holiday'} — closure schedule`,
      body: `Office closed ${closureSpan}. Check the notice board for details.`,
      link: '/dashboard',
      entityType: 'notice',
      entityId: '1',
      readAt: chance(55) ? addDays(TODAY, -randInt(0, 5)) : null,
      createdAt: addDays(TODAY, -6),
    });
  }

  for (let i = 0; i < notificationRows.length; i += 3_000) {
    await prisma.notification.createMany({ data: notificationRows.slice(i, i + 3_000) });
  }
  log('created notifications', `${notificationRows.length} (${notificationRows.filter((n) => !n.readAt).length} unread)`);

  // ── help desk ──────────────────────────────────────────────────────
  const TICKETS = [
    { category: 'IT', subject: 'Cannot log in to the VPN from home', body: 'The VPN client rejects my credentials since yesterday evening. Works fine on the office network.', priority: 'HIGH' },
    { category: 'Payroll', subject: 'Provident fund deduction looks wrong this month', body: 'My PF deduction is higher than 10% of basic on the latest payslip. Could you check?', priority: 'MEDIUM' },
    { category: 'HR', subject: 'Need an employment certificate for a visa application', body: 'Applying for a Schengen visa and the embassy needs a salary certificate on letterhead.', priority: 'MEDIUM' },
    { category: 'IT', subject: 'RFID card not registering at the gate', body: 'My access card was not read this morning, so my in-time is missing. Raised an attendance edit request too.', priority: 'HIGH' },
    { category: 'Facilities', subject: 'Air conditioning not working on the 6th floor', body: 'The east side of the 6th floor has had no cooling since Sunday.', priority: 'MEDIUM' },
    { category: 'HR', subject: 'Leave balance does not reflect my carry-forward', body: 'I was told 12 days would carry over from last year but my annual balance does not show them.', priority: 'MEDIUM' },
    { category: 'IT', subject: 'Request additional monitor', body: 'Working across three services daily; a second monitor would help considerably.', priority: 'LOW' },
    { category: 'Payroll', subject: 'Tax deduction increased sharply', body: 'My monthly tax jumped after the increment. Could I get a breakdown of the calculation?', priority: 'MEDIUM' },
    { category: 'Facilities', subject: 'Parking pass renewal', body: 'My parking pass expires at the end of this month.', priority: 'LOW' },
    { category: 'HR', subject: 'Update my emergency contact', body: 'My emergency contact number has changed; the self-service form rejects the new number format.', priority: 'LOW' },
    { category: 'IT', subject: 'Laptop battery drains within two hours', body: 'Battery health has degraded badly. Requesting a replacement or a battery swap.', priority: 'MEDIUM' },
    { category: 'HR', subject: 'Clarification on paternity leave eligibility', body: 'Expecting our first child next month — how many days am I entitled to and what notice is needed?', priority: 'MEDIUM' },
  ];

  const requesters = pickN(org.employees.filter((e) => e.companyId === org.primaryCompanyId), TICKETS.length);
  await prisma.helpdeskTicket.createMany({
    data: TICKETS.map((t, i) => {
      const createdAt = addDays(TODAY, -randInt(0, 30));
      const status = i < 4 ? 'OPEN' : i < 7 ? 'IN_PROGRESS' : chance(70) ? 'RESOLVED' : 'CLOSED';
      const resolved = ['RESOLVED', 'CLOSED'].includes(status);
      return {
        companyId: org.primaryCompanyId,
        requesterId: requesters[i].id,
        assigneeId: t.category === 'IT' ? itAdmin.id : hrAdmin.id,
        category: t.category,
        subject: t.subject,
        body: t.body,
        priority: t.priority as never,
        status: status as never,
        resolutionNote: resolved
          ? pick([
              'Resolved — please confirm if the issue recurs.',
              'Fixed and verified with the requester.',
              'Actioned; documentation updated to prevent a repeat.',
            ])
          : null,
        createdAt,
        resolvedAt: resolved ? addDays(createdAt, randInt(1, 5)) : null,
      };
    }),
  });
  log('created help desk tickets', `${TICKETS.length} (4 open, 3 in progress)`);

  // ── profile change requests ────────────────────────────────────────
  const changeRequesters = pickN(org.employees.filter((e) => e.companyId === org.primaryCompanyId), 14);
  const FIELDS = [
    { fieldPath: 'personalEmail', label: 'personal email' },
    { fieldPath: 'alternateNumber', label: 'alternate number' },
    { fieldPath: 'maritalStatus', label: 'marital status' },
    { fieldPath: 'spouseName', label: 'spouse name' },
    { fieldPath: 'presentAddress', label: 'present address' },
  ];
  await prisma.profileChangeRequest.createMany({
    data: changeRequesters.map((emp, i) => {
      const field = FIELDS[i % FIELDS.length];
      const status = i < 5 ? 'PENDING' : chance(75) ? 'APPROVED' : 'REJECTED';
      const requestedAt = addDays(TODAY, -randInt(1, 40));
      return {
        employeeId: emp.id,
        fieldPath: field.fieldPath,
        currentValue: field.fieldPath === 'maritalStatus' ? 'SINGLE' : 'previous value on record',
        requestedValue:
          field.fieldPath === 'personalEmail' ? `${emp.username}.new@personal.example`
          : field.fieldPath === 'alternateNumber' ? phone()
          : field.fieldPath === 'maritalStatus' ? 'MARRIED'
          : field.fieldPath === 'spouseName' ? 'Name as per marriage certificate'
          : `Building ${randInt(1, 90)}, Street ${randInt(1, 30)}, ${DEMO.areas[0]}, ${DEMO.headOffice.city}`,
        reason: pick([
          'Recently changed — please update my record.',
          'Correcting an error made during onboarding.',
          'Moved to a new address this month.',
        ]),
        status: status as never,
        reviewerId: status === 'PENDING' ? null : hrAdmin.id,
        reviewNote: status === 'REJECTED' ? 'Please attach supporting documentation and re-submit.' : null,
        requestedAt,
        reviewedAt: status === 'PENDING' ? null : addDays(requestedAt, randInt(1, 5)),
      };
    }),
  });
  log('created profile change requests', '14 (5 pending HR review)');

  // ── audit trail ────────────────────────────────────────────────────
  const auditRows: any[] = [];
  const approvedLeave = await prisma.leaveRequest.findMany({
    where: { status: 'APPROVED' },
    select: { id: true, approverId: true, employeeId: true },
    take: 120,
  });
  for (const req of approvedLeave) {
    if (!req.approverId) continue;
    auditRows.push({
      actorId: req.approverId,
      companyId: org.primaryCompanyId,
      action: 'leave.approve',
      entityType: 'leave_request',
      entityId: String(req.id),
      before: { status: 'PENDING' },
      after: { status: 'APPROVED' },
      ip: `10.0.${randInt(1, 20)}.${randInt(2, 250)}`,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0.0.0',
      createdAt: addDays(TODAY, -randInt(1, 90)),
    });
  }
  const lockedRuns = await prisma.payrollRun.findMany({
    where: { status: 'LOCKED' },
    select: { id: true, month: true, year: true, totalNet: true },
  });
  const payrollAdmin = org.employees.find((e) => e.username === 'payroll')!;
  for (const run of lockedRuns) {
    auditRows.push({
      actorId: payrollAdmin.id,
      companyId: org.primaryCompanyId,
      action: 'payroll.lock',
      entityType: 'payroll_run',
      entityId: String(run.id),
      before: { status: 'APPROVED' },
      after: { status: 'LOCKED', totalNet: Number(run.totalNet) },
      ip: `10.0.5.${randInt(2, 250)}`,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0',
      createdAt: d(`${run.year}-${String(run.month).padStart(2, '0')}-28`),
    });
  }
  await prisma.auditLog.createMany({ data: auditRows });
  log('created audit log entries', auditRows.length);

  // ── a couple of finished report jobs ───────────────────────────────
  await prisma.reportJob.createMany({
    data: [
      {
        companyId: org.primaryCompanyId,
        requestedById: payrollAdmin.id,
        reportType: 'EmployeeTax',
        format: 'xlsx',
        params: { fiscalYear: `${TODAY.getUTCFullYear()}-${String((TODAY.getUTCFullYear() + 1) % 100).padStart(2, '0')}` },
        status: 'READY',
        progressPct: 100,
        filePath: 'reports/employee-tax-fy.xlsx',
        fileSizeBytes: 184_320,
        rowCount: org.employees.length,
        expiresAt: addDays(TODAY, 7),
        createdAt: addDays(TODAY, -2),
        startedAt: addDays(TODAY, -2),
        finishedAt: addDays(TODAY, -2),
      },
      {
        companyId: org.primaryCompanyId,
        requestedById: hrAdmin.id,
        reportType: 'AttendanceMonthly',
        format: 'xlsx',
        params: { month: TODAY.getUTCMonth() + 1, year: TODAY.getUTCFullYear() },
        status: 'READY',
        progressPct: 100,
        filePath: 'reports/attendance-monthly.xlsx',
        fileSizeBytes: 421_888,
        rowCount: 1_408,
        expiresAt: addDays(TODAY, 7),
        createdAt: addDays(TODAY, -1),
        startedAt: addDays(TODAY, -1),
        finishedAt: addDays(TODAY, -1),
      },
    ],
  });
  log('created report jobs', '2 completed exports');
}
