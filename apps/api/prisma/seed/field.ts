import type { OrgResult } from './org';
import {
  DHAKA_AREAS, DISTRICTS, SURNAMES, TODAY, addDays, atTime, chance, eachDay, iso,
  log, pick, pickN, prisma, randInt, rng, round2, section,
} from './lib';

/** Customer visits & GPS tracking for the field force. */
export async function seedField(org: OrgResult): Promise<void> {
  section('Sales force — customers, visits & tracking');

  // ── customers ──────────────────────────────────────────────────────
  const ORG_TYPES = ['pharmacy', 'hospital', 'distributor', 'clinic', 'corporate'];
  const CHAIN_PREFIX = ['Lazz', 'Tamanna', 'Shohag', 'Al-Madina', 'Popular', 'Ibn Sina', 'Labaid', 'Square', 'United', 'Prescription'];
  const CHAIN_SUFFIX = ['Pharma', 'Pharmacy', 'Medicine Corner', 'Drug House', 'Medical Hall', 'Diagnostics', 'Hospital', 'Clinic'];

  const customerRows: any[] = [];
  const seen = new Set<string>();
  while (customerRows.length < 120) {
    const name = `${pick(CHAIN_PREFIX)} ${pick(CHAIN_SUFFIX)} — ${pick([...DHAKA_AREAS, ...DISTRICTS])}`;
    if (seen.has(name)) continue;
    seen.add(name);
    const inDhaka = chance(65);
    customerRows.push({
      companyId: org.primaryCompanyId,
      name,
      code: `CUS-${String(customerRows.length + 1).padStart(4, '0')}`,
      address: `${randInt(1, 200)}, ${pick(DHAKA_AREAS)}`,
      city: inDhaka ? 'Dhaka' : pick(DISTRICTS),
      // Coordinates scattered around Dhaka / the chosen district.
      lat: round2(inDhaka ? 23.72 + (rng() - 0.5) * 0.22 : 22.3 + rng() * 2.4),
      lng: round2(inDhaka ? 90.4 + (rng() - 0.5) * 0.22 : 89.5 + rng() * 2.4),
      contactLevel: pick(['A_PLUS', 'A', 'A', 'B', 'B', 'B', 'C', 'C', 'D'] as const),
      orgType: pick(ORG_TYPES),
      contactPerson: `${pick(['Dr.', 'Mr.', 'Ms.'])} ${pick(SURNAMES)}`,
      contactPhone: `01${randInt(3, 9)}${randInt(10_000_000, 99_999_999)}`,
    });
  }
  await prisma.customer.createMany({ data: customerRows });
  const customers = await prisma.customer.findMany({
    where: { companyId: org.primaryCompanyId },
    select: { id: true, name: true, lat: true, lng: true, contactLevel: true },
  });
  log('created customers', customers.length);

  // ── who is in the field ────────────────────────────────────────────
  const fieldDeptIds = org.departments
    .filter((x) => ['Field Force', 'Sales & Distribution'].includes(x.name))
    .map((x) => x.id);
  const fieldForce = org.employees.filter((e) => fieldDeptIds.includes(e.departmentId));
  log('identified field staff', `${fieldForce.length} employees`);

  if (fieldForce.length === 0) return;

  // ── visits over the last 120 days ──────────────────────────────────
  const visitRows: any[] = [];
  const days = eachDay(addDays(TODAY, -120), TODAY);

  for (const emp of fieldForce) {
    // Each rep works a stable territory, so the "top 20 customers"
    // analytics show repeat relationships rather than random noise.
    const territory = pickN(customers, randInt(8, 18));

    for (const day of days) {
      if (day < emp.joiningDate) continue;
      if (day.getUTCDay() === 5) continue; // Friday off
      if (!chance(72)) continue;           // not every day is a field day

      const visitsToday = randInt(2, 6);
      for (const customer of pickN(territory, visitsToday)) {
        const checkIn = atTime(day, '09:30', randInt(0, 420));
        const durationMin = randInt(15, 75);
        // GPS punch lands a realistic few metres from the registered point.
        const jitter = () => (rng() - 0.5) * 0.0018;
        const isJoint = chance(14);

        visitRows.push({
          customerId: customer.id,
          employeeId: emp.id,
          visitDate: day,
          checkInAt: checkIn,
          checkOutAt: new Date(checkIn.getTime() + durationMin * 60_000),
          personVisited: `${pick(['Dr.', 'Mr.', 'Ms.', 'Proprietor'])} ${pick(SURNAMES)}`,
          purpose: pick([
            'Product detailing — new SKU introduction',
            'Order collection',
            'Stock check & shelf audit',
            'Payment follow-up',
            'Complaint resolution',
            'Relationship / courtesy call',
          ]),
          outcome: pick([
            'Order placed',
            'Interested — follow up next week',
            'No requirement this cycle',
            'Requested sample',
            'Escalated to distributor',
          ]),
          orderValue: chance(45) ? round2(randInt(2, 180) * 1_000) : null,
          lat: customer.lat ? round2(customer.lat + jitter()) : null,
          lng: customer.lng ? round2(customer.lng + jitter()) : null,
          distanceM: randInt(3, 140),
          isJointVisit: isJoint,
          createdAt: checkIn,
        });
      }
    }
  }

  for (let i = 0; i < visitRows.length; i += 4_000) {
    await prisma.customerVisit.createMany({ data: visitRows.slice(i, i + 4_000) });
  }
  log('created customer visits', visitRows.length);

  // ── joint-visit participants ───────────────────────────────────────
  const jointVisits = await prisma.customerVisit.findMany({
    where: { isJointVisit: true },
    select: { id: true, employeeId: true },
  });
  const participantRows: any[] = [];
  for (const visit of jointVisits) {
    const partners = pickN(
      fieldForce.filter((e) => e.id !== visit.employeeId),
      randInt(1, 2),
    );
    for (const partner of partners) {
      participantRows.push({ visitId: visit.id, employeeId: partner.id });
    }
  }
  await prisma.customerVisitParticipant.createMany({ data: participantRows, skipDuplicates: true });
  log('created joint-visit participants', participantRows.length);

  // ── tracking consent & configuration ───────────────────────────────
  // Consent is explicit and windowed. Two reps have deliberately NOT
  // consented, so the UI has to handle "tracking unavailable" honestly.
  const nonConsenting = pickN(fieldForce, Math.min(2, fieldForce.length));
  const configRows = fieldForce.map((emp) => {
    const consented = !nonConsenting.some((x) => x.id === emp.id);
    return {
      employeeId: emp.id,
      enabled: consented,
      consentGivenAt: consented ? addDays(emp.joiningDate, randInt(1, 20)) : null,
      windowStart: '09:00',
      windowEnd: '19:00',
      pingIntervalSec: 120,
      retentionDays: 90,
    };
  });
  await prisma.trackingConfig.createMany({ data: configRows });
  log('created tracking configs', `${configRows.length} (${nonConsenting.length} without consent)`);

  // ── tracking sessions & breadcrumb points ──────────────────────────
  const consenting = fieldForce.filter((e) => !nonConsenting.some((x) => x.id === e.id));
  const sessionRows: { employeeId: bigint; startedAt: Date; endedAt: Date | null; status: string; batteryStart: number; batteryEnd: number | null; deviceInfo: string; points: { recordedAt: Date; lat: number; lng: number; accuracyM: number; speedKph: number }[]; distanceKm: number }[] = [];

  for (const emp of consenting) {
    // 14 days of history, plus a live session for a few reps today.
    for (let dayOffset = 14; dayOffset >= 0; dayOffset--) {
      const day = addDays(TODAY, -dayOffset);
      if (day < emp.joiningDate) continue;
      if (day.getUTCDay() === 5) continue;
      if (!chance(70)) continue;

      const isToday = dayOffset === 0;
      const ongoing = isToday && chance(55);
      const startedAt = atTime(day, '09:30', randInt(0, 45));
      const durationMin = ongoing ? randInt(60, 240) : randInt(240, 480);

      // Walk a plausible route: start near Dhaka centre and drift.
      let lat = 23.75 + (rng() - 0.5) * 0.12;
      let lng = 90.4 + (rng() - 0.5) * 0.12;
      const points: { recordedAt: Date; lat: number; lng: number; accuracyM: number; speedKph: number }[] = [];
      let distanceKm = 0;

      const pingCount = Math.floor(durationMin / 8); // one point every ~8 min
      for (let p = 0; p < pingCount; p++) {
        const stepLat = (rng() - 0.5) * 0.006;
        const stepLng = (rng() - 0.5) * 0.006;
        lat += stepLat;
        lng += stepLng;
        // Rough equirectangular distance, good enough for a demo odometer.
        distanceKm += Math.sqrt((stepLat * 111) ** 2 + (stepLng * 102) ** 2);
        points.push({
          recordedAt: new Date(startedAt.getTime() + p * 8 * 60_000),
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
          accuracyM: randInt(5, 45),
          speedKph: Number((rng() * 32).toFixed(1)),
        });
      }

      const batteryStart = randInt(70, 100);
      sessionRows.push({
        employeeId: emp.id,
        startedAt,
        endedAt: ongoing ? null : new Date(startedAt.getTime() + durationMin * 60_000),
        status: ongoing ? 'ONGOING' : 'COMPLETED',
        batteryStart,
        batteryEnd: ongoing ? null : Math.max(5, batteryStart - randInt(15, 55)),
        deviceInfo: pick([
          'Android 14 — Samsung Galaxy A35',
          'Android 13 — Xiaomi Redmi Note 12',
          'iOS 18.1 — iPhone 13',
          'Android 14 — Realme 11',
        ]),
        distanceKm: round2(distanceKm),
        points,
      });
    }
  }

  let pointCount = 0;
  for (const session of sessionRows) {
    const created = await prisma.trackingSession.create({
      data: {
        employeeId: session.employeeId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        status: session.status as never,
        distanceKm: session.distanceKm,
        pointCount: session.points.length,
        batteryStart: session.batteryStart,
        batteryEnd: session.batteryEnd,
        deviceInfo: session.deviceInfo,
      },
    });
    await prisma.trackingPoint.createMany({
      data: session.points.map((p) => ({ ...p, sessionId: created.id })),
    });
    pointCount += session.points.length;
  }
  log('created tracking sessions', `${sessionRows.length} (${sessionRows.filter((s) => s.status === 'ONGOING').length} live now)`);
  log('created tracking points', pointCount);
}
