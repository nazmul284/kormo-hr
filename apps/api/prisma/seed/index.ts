import { seedAttendance } from './attendance';
import { seedCalendar } from './calendar';
import { seedDemoGuarantees } from './demo-guarantees';
import { seedField } from './field';
import { seedLeave } from './leave';
import { seedLifecycle } from './lifecycle';
import { PACK, TODAY, iso, prisma, section } from './lib';
import { seedMoney } from './money';
import { TENANT, seedOrg } from './org';
import { seedWorkplace } from './workplace';

/**
 * Tables are truncated in dependency order so the seed is re-runnable
 * without a full `prisma migrate reset`. RESTART IDENTITY keeps the
 * generated IDs stable between runs, which is what makes the demo
 * reproducible.
 */
const TABLES = [
  'audit_log', 'report_job', 'notification', 'helpdesk_ticket', 'office_policy', 'notice',
  'room_booking_attendee', 'room_booking', 'room',
  'exit_interview', 'clearance_item', 'clearance_department', 'resignation_approval', 'resignation',
  'onboarding_task', 'onboarding_template_item', 'onboarding_template',
  'tracking_point', 'tracking_session', 'tracking_config',
  'customer_visit_participant', 'customer_visit', 'customer',
  'job_confirmation_review', 'goal_review', 'goal', 'goal_cycle_member', 'goal_cycle',
  'meal', 'meal_subscription', 'food_menu', 'food_program',
  'tax_payment', 'employee_tax_year', 'tax_slab', 'tax_config',
  'payslip', 'payroll_run',
  'holiday', 'leave_carry_forward', 'leave_request', 'leave_balance',
  'leave_policy_line', 'leave_policy', 'leave_type',
  'shift_exchange_request', 'compensation_request', 'overtime_request',
  'attendance_edit_request', 'break_time', 'attendance', 'roster_assignment',
  'attendance_roster', 'shift',
  'profile_update_config', 'profile_change_request',
  'promotion_history', 'salary_history', 'salary_component',
  'employee_benefit', 'employee_bank', 'employee_document', 'employee_experience',
  'employee_education', 'employee_nominee', 'employee_emergency', 'employee_address',
  'password_reset_token', 'refresh_token', 'employee_company_access', 'employee_role',
  'employee', 'role', 'designation', 'department', 'location', 'company_feature', 'company',
];

async function truncateAll() {
  section('Resetting database');
  // Single statement so FK ordering never matters mid-way.
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`,
  );
  console.log(`  \x1b[2mtruncated ${TABLES.length} tables\x1b[0m`);
}

async function main() {
  const started = Date.now();

  console.log('');
  console.log('\x1b[1m\x1b[35m  ╭───────────────────────────────────────────────╮\x1b[0m');
  console.log('\x1b[1m\x1b[35m  │\x1b[0m  \x1b[1mKormo HR\x1b[0m — demo data generator            \x1b[1m\x1b[35m│\x1b[0m');
  console.log(`\x1b[1m\x1b[35m  │\x1b[0m  \x1b[2mseed clock: ${iso(TODAY)}\x1b[0m                    \x1b[1m\x1b[35m│\x1b[0m`);
  console.log(
    `\x1b[1m\x1b[35m  │\x1b[0m  \x1b[2mcountry:    ${PACK.flag} ${PACK.name} (${PACK.currency.code})`.padEnd(66)
    + '\x1b[0m\x1b[1m\x1b[35m│\x1b[0m',
  );
  console.log(
    `\x1b[1m\x1b[35m  │\x1b[0m  \x1b[2mtenant:     ${TENANT.primary.name}`.padEnd(66)
    + '\x1b[0m\x1b[1m\x1b[35m│\x1b[0m',
  );
  console.log('\x1b[1m\x1b[35m  ╰───────────────────────────────────────────────╯\x1b[0m');

  await truncateAll();

  // Order matters: leave must exist before attendance so approved leave
  // shows up as LEAVE days rather than absences, and attendance must
  // exist before payroll so absence deductions are real.
  const org = await seedOrg();
  const calendar = await seedCalendar(org);
  const leave = await seedLeave(org, calendar);
  const attendance = await seedAttendance(org, calendar, leave);
  await seedMoney(org, attendance);
  await seedField(org);
  await seedLifecycle(org);
  await seedWorkplace(org);

  // Last: make sure each hand-placed demo login has representative work
  // waiting, which random distribution alone does not guarantee.
  await seedDemoGuarantees(org, calendar, leave);

  // ── summary ────────────────────────────────────────────────────────
  section('Summary');
  const counts = {
    companies: await prisma.company.count(),
    employees: await prisma.employee.count(),
    attendance: await prisma.attendance.count(),
    leaveRequests: await prisma.leaveRequest.count(),
    payslips: await prisma.payslip.count(),
    taxStatements: await prisma.employeeTaxYear.count(),
    goals: await prisma.goal.count(),
    customerVisits: await prisma.customerVisit.count(),
    trackingPoints: await prisma.trackingPoint.count(),
    meals: await prisma.meal.count(),
    bookings: await prisma.roomBooking.count(),
    onboardingTasks: await prisma.onboardingTask.count(),
    resignations: await prisma.resignation.count(),
    notifications: await prisma.notification.count(),
  };
  const width = Math.max(...Object.keys(counts).map((k) => k.length));
  for (const [key, value] of Object.entries(counts)) {
    console.log(`  \x1b[2m${key.padEnd(width)}\x1b[0m  ${value.toLocaleString('en-US')}`);
  }

  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\n  \x1b[2m~${totalRows.toLocaleString('en-US')} rows across the headline tables\x1b[0m`);

  // ── credentials ────────────────────────────────────────────────────
  section('Demo accounts');
  const password = process.env.SEED_DEFAULT_PASSWORD ?? 'Kormo@123';
  const userWidth = Math.max(...org.demoAccounts.map((a) => a.username.length));
  const roleWidth = Math.max(...org.demoAccounts.map((a) => a.role.length));
  for (const account of org.demoAccounts) {
    console.log(
      `  \x1b[36m${account.username.padEnd(userWidth)}\x1b[0m  `
      + `\x1b[2m${account.role.padEnd(roleWidth)}\x1b[0m  `
      + `${account.name} — ${account.description}`,
    );
  }
  console.log(`\n  every account uses the password \x1b[1m${password}\x1b[0m`);
  console.log(`\n\x1b[32m✓ seed complete in ${((Date.now() - started) / 1000).toFixed(1)}s\x1b[0m\n`);
}

main()
  .catch((error) => {
    console.error('\n\x1b[31m✗ seed failed\x1b[0m');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
