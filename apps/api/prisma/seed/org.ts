import bcrypt from 'bcryptjs';
import type { Department, Designation, Location } from '@prisma/client';
import {
  FEATURE_FLAGS,
  HR_ADMIN_PERMISSIONS,
  LINE_MANAGER_PERMISSIONS,
  PAYROLL_ADMIN_PERMISSIONS,
  PERMISSIONS,
  SELF_SERVICE_PERMISSIONS,
  SYSTEM_ROLES,
  ALL_PERMISSIONS,
} from '@kormo/shared';

import {
  BANKS, BLOOD_GROUPS, DEGREES, DHAKA_AREAS, DISTRICTS, FEMALE_FIRST, MALE_FIRST,
  PREV_EMPLOYERS, RELIGIONS, SURNAMES, TODAY, UNIVERSITIES,
  addDays, addMonths, bdPhone, chance, d, iso, log, nid, pick, pickN, prisma,
  randInt, rng, round2, section, slugify, tin,
} from './lib';

export interface SeededEmployee {
  id: bigint;
  visibleId: string;
  username: string;
  firstName: string;
  lastName: string;
  gender: 'MALE' | 'FEMALE';
  level: number;
  gross: number;
  companyId: number;
  departmentId: number;
  designationId: number;
  locationId: number;
  lineManagerId: bigint | null;
  joiningDate: Date;
  employmentStatus: string;
  isLineManager: boolean;
  email: string;
}

export interface OrgResult {
  companies: { id: number; alias: string; name: string }[];
  primaryCompanyId: number;
  locations: { id: number; companyId: number; alias: string }[];
  departments: { id: number; companyId: number; name: string }[];
  designations: { id: number; companyId: number; name: string; level: number; grade: string }[];
  employees: SeededEmployee[];
  demoAccounts: { username: string; role: string; name: string; description: string }[];
}

// ── org blueprint ─────────────────────────────────────────────────────

const DEPARTMENTS = [
  'Executive Office',
  'Technology',
  'Human Resources',
  'Finance & Accounts',
  'Sales & Distribution',
  'Marketing',
  'Supply Chain',
  'Pharmacy Operations',
  'Customer Support',
  'Quality Assurance',
  'Admin & Facilities',
  'Field Force',
];

/** name, grade, seniority level, monthly gross (BDT) */
const DESIGNATIONS: [string, string, number, number][] = [
  ['Managing Director', '1a', 10, 450_000],
  ['Chief Technology Officer', '1b', 9, 320_000],
  ['Chief Financial Officer', '1b', 9, 320_000],
  ['Head of Human Resources', '2a', 8, 240_000],
  ['Head of Sales', '2a', 8, 240_000],
  ['Head of Supply Chain', '2a', 8, 220_000],
  ['Senior Manager', '3a', 7, 155_000],
  ['Manager', '3b', 6, 115_000],
  ['Assistant Manager', '4a', 5, 88_000],
  ['Senior Software Engineer', '4a', 5, 92_000],
  ['Territory Sales Manager', '4a', 5, 78_000],
  ['Senior Officer', '5a', 4, 62_000],
  ['Software Engineer', '5a', 4, 68_000],
  ['Pharmacist', '5a', 4, 58_000],
  ['Officer', '5b', 3, 45_000],
  ['Medical Promotion Officer', '5b', 3, 42_000],
  ['Junior Software Engineer', '5b', 3, 48_000],
  ['Executive', '5b', 3, 38_000],
  ['Junior Officer', '6a', 2, 32_000],
  ['Intern', '7a', 1, 18_000],
];

/** Which designations staff which departments, by role tier. */
const DEPT_STAFFING: Record<string, { managers: string[]; individuals: string[] }> = {
  Technology: {
    managers: ['Senior Manager', 'Manager'],
    individuals: ['Senior Software Engineer', 'Software Engineer', 'Junior Software Engineer', 'Intern'],
  },
  'Human Resources': {
    managers: ['Manager', 'Assistant Manager'],
    individuals: ['Senior Officer', 'Officer', 'Junior Officer'],
  },
  'Finance & Accounts': {
    managers: ['Senior Manager', 'Manager'],
    individuals: ['Senior Officer', 'Officer', 'Junior Officer'],
  },
  'Sales & Distribution': {
    managers: ['Senior Manager', 'Territory Sales Manager'],
    individuals: ['Medical Promotion Officer', 'Officer', 'Executive'],
  },
  Marketing: {
    managers: ['Manager'],
    individuals: ['Senior Officer', 'Executive', 'Officer'],
  },
  'Supply Chain': {
    managers: ['Manager', 'Assistant Manager'],
    individuals: ['Officer', 'Executive', 'Junior Officer'],
  },
  'Pharmacy Operations': {
    managers: ['Manager'],
    individuals: ['Pharmacist', 'Senior Officer', 'Officer'],
  },
  'Customer Support': {
    managers: ['Assistant Manager'],
    individuals: ['Executive', 'Officer', 'Junior Officer'],
  },
  'Quality Assurance': {
    managers: ['Assistant Manager'],
    individuals: ['Senior Officer', 'Officer'],
  },
  'Admin & Facilities': {
    managers: ['Assistant Manager'],
    individuals: ['Officer', 'Junior Officer'],
  },
  'Field Force': {
    managers: ['Territory Sales Manager'],
    individuals: ['Medical Promotion Officer', 'Executive'],
  },
};

/** Hand-placed accounts so the README can hand out real credentials. */
const DEMO_ACCOUNTS: {
  username: string;
  designation: string;
  department: string;
  role: string;
  gender: 'MALE' | 'FEMALE';
  firstName: string;
  lastName: string;
  description: string;
  gross?: number;
}[] = [
  {
    username: 'md', designation: 'Managing Director', department: 'Executive Office',
    role: SYSTEM_ROLES.SUPER_ADMIN, gender: 'MALE', firstName: 'Rezaul', lastName: 'Karim',
    description: 'Managing Director — sees every company, every module',
  },
  {
    username: 'admin', designation: 'Senior Manager', department: 'Technology',
    role: SYSTEM_ROLES.IT_ADMIN, gender: 'MALE', firstName: 'Nazmul', lastName: 'Hossain',
    description: 'IT administrator — platform + onboarding IT lane',
  },
  {
    username: 'hr.admin', designation: 'Head of Human Resources', department: 'Human Resources',
    role: SYSTEM_ROLES.HR_ADMIN, gender: 'FEMALE', firstName: 'Nusrat', lastName: 'Jahan',
    description: 'Head of HR — policies, approvals, onboarding, clearance',
  },
  {
    username: 'payroll', designation: 'Manager', department: 'Finance & Accounts',
    role: SYSTEM_ROLES.PAYROLL_ADMIN, gender: 'MALE', firstName: 'Mizanur', lastName: 'Rahman',
    description: 'Payroll manager — payroll runs, tax configuration',
  },
  {
    username: 'manager', designation: 'Manager', department: 'Technology',
    role: SYSTEM_ROLES.LINE_MANAGER, gender: 'MALE', firstName: 'Tanvir', lastName: 'Ahmed',
    description: 'Line manager with direct reports — the approval inbox',
  },
  {
    username: 'employee', designation: 'Senior Software Engineer', department: 'Technology',
    role: SYSTEM_ROLES.EMPLOYEE, gender: 'MALE', firstName: 'Sabbir', lastName: 'Islam',
    // Pinned (rather than taken from the designation table) so this
    // account's tax statement is stable across reseeds — the docs quote
    // its figures.
    gross: 92_000,
    description: 'Individual contributor — pure self-service view',
  },
  {
    username: 'field', designation: 'Medical Promotion Officer', department: 'Field Force',
    role: SYSTEM_ROLES.FIELD_FORCE, gender: 'MALE', firstName: 'Rakib', lastName: 'Uddin',
    description: 'Field force — customer visits and GPS tracking',
  },
];

/**
 * Demo tenant identity.
 *
 * Kept as configuration rather than literals so the seeded company can be
 * renamed for a demo, a pilot or a screenshot without touching code. The
 * default is deliberately fictional, and the mail domain uses the reserved
 * `.example` TLD so a seeded address can never reach a real inbox.
 */
const TENANT = {
  primary: {
    name: process.env.SEED_COMPANY_NAME ?? 'Shurjo Pharma Ltd',
    alias: process.env.SEED_COMPANY_ALIAS ?? 'shurjo',
    /** Prefix for the HR-facing unique tag on each employee record. */
    tagPrefix: process.env.SEED_COMPANY_TAG_PREFIX ?? 'SPL',
    domain: process.env.SEED_COMPANY_DOMAIN ?? 'shurjo.example',
  },
  secondary: {
    name: process.env.SEED_SECOND_COMPANY_NAME ?? 'Shurjo Logistics Ltd',
    alias: process.env.SEED_SECOND_COMPANY_ALIAS ?? 'shurjo-logistics',
  },
};

export async function seedOrg(): Promise<OrgResult> {
  section('Tenancy & organisation');

  const passwordHash = await bcrypt.hash(process.env.SEED_DEFAULT_PASSWORD ?? 'Kormo@123', 10);
  log('hashed the shared demo password', 'bcrypt cost 10');

  // ── companies ──────────────────────────────────────────────────────
  const primary = await prisma.company.create({
    data: {
      name: TENANT.primary.name,
      alias: TENANT.primary.alias,
      legalName: TENANT.primary.name.replace(/ Ltd$/, ' Limited'),
      tin: '123456789012', bin: '004512345-0101',
      address: 'House 42, Road 11, Banani, Dhaka 1213, Bangladesh',
      contactEmail: `people@${TENANT.primary.domain}`,
      contactPhone: '+8809610003030',
      timezone: 'Asia/Dhaka', currency: 'BDT', fiscalYearStartMonth: 7,
    },
  });
  const logistics = await prisma.company.create({
    data: {
      name: TENANT.secondary.name,
      alias: TENANT.secondary.alias,
      legalName: TENANT.secondary.name.replace(/ Ltd$/, ' Limited'),
      tin: '987654321098',
      address: 'Plot 7, Tejgaon Industrial Area, Dhaka 1208, Bangladesh',
      contactEmail: `ops@${TENANT.secondary.alias}.example`,
      timezone: 'Asia/Dhaka', currency: 'BDT', fiscalYearStartMonth: 7,
    },
  });
  log('created companies', `${primary.name}, ${logistics.name}`);

  // ── feature flags ──────────────────────────────────────────────────
  const allFlags = Object.values(FEATURE_FLAGS);
  await prisma.companyFeature.createMany({
    data: allFlags.map((key) => ({ companyId: primary.id, enabled: true, key })),
  });
  // The second tenant runs a deliberately reduced feature set, so the UI's
  // flag-gating is actually exercised rather than assumed.
  await prisma.companyFeature.createMany({
    data: allFlags.map((key) => ({
      companyId: logistics.id,
      key,
      enabled: ![
        FEATURE_FLAGS.FOOD_PROGRAM,
        FEATURE_FLAGS.PMS,
        FEATURE_FLAGS.ROOM_BOOKING,
        FEATURE_FLAGS.CUSTOMER_VISIT_OVERVIEW,
      ].includes(key as never),
    })),
  });
  log('enabled feature flags', `${allFlags.length} keys x 2 tenants`);

  // ── locations ──────────────────────────────────────────────────────
  const locationSpec = [
    { companyId: primary.id, name: 'Head Office — Banani', alias: 'HO-BANANI', city: 'Dhaka', lat: 23.7936, lng: 90.4043, geofenceM: 150 },
    { companyId: primary.id, name: 'Tejgaon Warehouse', alias: 'WH-TEJGAON', city: 'Dhaka', lat: 23.7639, lng: 90.3944, geofenceM: 250 },
    { companyId: primary.id, name: 'Chattogram Branch', alias: 'BR-CTG', city: 'Chattogram', lat: 22.3569, lng: 91.7832, geofenceM: 150 },
    { companyId: primary.id, name: 'Sylhet Branch', alias: 'BR-SYL', city: 'Sylhet', lat: 24.8949, lng: 91.8687, geofenceM: 150 },
    { companyId: logistics.id, name: 'Logistics Hub — Tejgaon', alias: 'LOG-HUB', city: 'Dhaka', lat: 23.7601, lng: 90.3915, geofenceM: 300 },
  ];
  const locations: Location[] = [];
  for (const spec of locationSpec) {
    locations.push(await prisma.location.create({ data: { ...spec, address: `${spec.name}, ${spec.city}` } }));
  }
  log('created locations', locations.length);

  // ── departments (two levels: Executive Office parents nothing) ──────
  const departments: Department[] = [];
  for (const name of DEPARTMENTS) {
    departments.push(
      await prisma.department.create({
        data: {
          companyId: primary.id,
          name,
          code: name.split(/[\s&]+/).map((w) => w[0]).join('').toUpperCase().slice(0, 4),
        },
      }),
    );
  }
  // Field Force rolls up under Sales & Distribution.
  const sales = departments.find((x) => x.name === 'Sales & Distribution')!;
  const fieldForce = departments.find((x) => x.name === 'Field Force')!;
  await prisma.department.update({
    where: { id: fieldForce.id },
    data: { parentDepartmentId: sales.id },
  });
  // Second tenant gets a small structure of its own.
  const logisticsDepts: Department[] = [];
  for (const name of ['Operations', 'Fleet', 'Warehouse']) {
    logisticsDepts.push(await prisma.department.create({ data: { companyId: logistics.id, name } }));
  }
  log('created departments', `${departments.length} + ${logisticsDepts.length}`);

  // ── designations ───────────────────────────────────────────────────
  const designations: Designation[] = [];
  for (const [name, grade, level] of DESIGNATIONS) {
    designations.push(
      await prisma.designation.create({ data: { companyId: primary.id, name, grade, level } }),
    );
  }
  for (const [name, grade, level] of DESIGNATIONS.slice(6)) {
    await prisma.designation.create({ data: { companyId: logistics.id, name, grade, level } });
  }
  log('created designations', designations.length);

  // ── roles ──────────────────────────────────────────────────────────
  const roleSpec: { key: string; name: string; permissions: string[] }[] = [
    { key: SYSTEM_ROLES.SUPER_ADMIN, name: 'Super Administrator', permissions: ALL_PERMISSIONS },
    { key: SYSTEM_ROLES.HR_ADMIN, name: 'HR Administrator', permissions: [...new Set([...SELF_SERVICE_PERMISSIONS, ...HR_ADMIN_PERMISSIONS])] },
    { key: SYSTEM_ROLES.PAYROLL_ADMIN, name: 'Payroll Administrator', permissions: [...new Set([...SELF_SERVICE_PERMISSIONS, ...PAYROLL_ADMIN_PERMISSIONS])] },
    { key: SYSTEM_ROLES.LINE_MANAGER, name: 'Line Manager', permissions: [...new Set([...SELF_SERVICE_PERMISSIONS, ...LINE_MANAGER_PERMISSIONS])] },
    { key: SYSTEM_ROLES.EMPLOYEE, name: 'Employee', permissions: SELF_SERVICE_PERMISSIONS },
    {
      key: SYSTEM_ROLES.IT_ADMIN, name: 'IT Administrator',
      permissions: [...new Set([...SELF_SERVICE_PERMISSIONS, PERMISSIONS.ONBOARDING_READ, PERMISSIONS.ONBOARDING_TASK_ACTION, PERMISSIONS.HELPDESK_RESOLVE, PERMISSIONS.EMPLOYEE_READ_ALL, PERMISSIONS.ROLE_WRITE, PERMISSIONS.AUDIT_READ])],
    },
    {
      key: SYSTEM_ROLES.FIELD_FORCE, name: 'Field Force',
      permissions: [...new Set([...SELF_SERVICE_PERMISSIONS, PERMISSIONS.VISIT_CREATE, PERMISSIONS.VISIT_READ_SELF])],
    },
  ];
  const roles = new Map<string, number>();
  for (const spec of roleSpec) {
    const role = await prisma.role.create({
      data: { key: spec.key, name: spec.name, permissions: spec.permissions, isSystem: true },
    });
    roles.set(spec.key, role.id);
  }
  log('created system roles', roleSpec.map((r) => r.key).join(', '));

  // ── salary components ──────────────────────────────────────────────
  for (const companyId of [primary.id, logistics.id]) {
    await prisma.salaryComponent.createMany({
      data: [
        { companyId, code: 'BASIC', name: 'Basic Salary', calcType: 'PCT_OF_GROSS', value: 50, isTaxable: true, isEarning: true, sortOrder: 1 },
        { companyId, code: 'HOUSE_RENT', name: 'House Rent Allowance', calcType: 'PCT_OF_GROSS', value: 30, isTaxable: true, isEarning: true, sortOrder: 2 },
        { companyId, code: 'CONVEYANCE', name: 'Conveyance Allowance', calcType: 'PCT_OF_GROSS', value: 10, isTaxable: true, isEarning: true, sortOrder: 3 },
        { companyId, code: 'MEDICAL', name: 'Medical Allowance', calcType: 'PCT_OF_GROSS', value: 10, isTaxable: true, isEarning: true, sortOrder: 4 },
        { companyId, code: 'PF_EMP', name: 'Provident Fund (employee)', calcType: 'PCT_OF_BASIC', value: 10, isTaxable: false, isEarning: false, sortOrder: 10 },
        { companyId, code: 'MOBILE', name: 'Mobile Allowance', calcType: 'FIXED', value: 1_000, isTaxable: true, isEarning: true, sortOrder: 5 },
        { companyId, code: 'TRANSPORT', name: 'Transport Allowance', calcType: 'FIXED', value: 2_500, isTaxable: true, isEarning: true, sortOrder: 6 },
      ],
    });
  }
  log('created salary components', 'Basic 50 / House 30 / Conveyance 10 / Medical 10');

  // ── profile self-service whitelist ─────────────────────────────────
  for (const companyId of [primary.id, logistics.id]) {
    await prisma.profileUpdateConfig.create({
      data: {
        companyId,
        allowedFields: [
          'personalEmail', 'alternateEmail', 'alternateNumber', 'maritalStatus',
          'spouseName', 'spouseDateOfBirth', 'bloodGroup', 'presentAddress',
          'emergencyContact', 'nominee', 'education', 'experience',
        ],
        // Low-risk fields apply immediately; the rest queue for HR.
        autoApprove: ['alternateNumber', 'alternateEmail', 'bloodGroup', 'presentAddress'],
      },
    });
  }
  log('configured self-service editable fields', '12 allowed, 4 auto-approved');

  // ══ employees ══════════════════════════════════════════════════════
  section('Employees & hierarchy');

  const targetCount = Number(process.env.SEED_EMPLOYEE_COUNT ?? 64);
  const designationByName = new Map(designations.map((x) => [x.name, x]));
  const deptByName = new Map(departments.map((x) => [x.name, x]));
  const grossByName = new Map(DESIGNATIONS.map(([name, , , gross]) => [name, gross]));
  const levelByName = new Map(DESIGNATIONS.map(([name, , level]) => [name, level]));

  const employees: SeededEmployee[] = [];
  let visibleSeq = 100;
  const usedUsernames = new Set<string>();

  async function createEmployee(opts: {
    firstName: string;
    lastName: string;
    gender: 'MALE' | 'FEMALE';
    designationName: string;
    departmentName: string;
    companyId: number;
    locationId: number;
    lineManagerId: bigint | null;
    username?: string;
    roleKey: string;
    joiningDate: Date;
    gross?: number;
    isLineManager?: boolean;
    isHeadOfDepartment?: boolean;
    employmentStatus?: 'PERMANENT' | 'PROBATION' | 'CONTRACT' | 'INTERN';
  }): Promise<SeededEmployee> {
    visibleSeq += 1;
    const designation = designationByName.get(opts.designationName)!;
    const department = deptByName.get(opts.departmentName)!;
    const level = levelByName.get(opts.designationName) ?? 3;
    const gross = opts.gross ?? grossByName.get(opts.designationName) ?? 40_000;

    let username = opts.username ?? slugify(`${opts.firstName}.${opts.lastName}`);
    if (usedUsernames.has(username)) username = `${username}${visibleSeq}`;
    usedUsernames.add(username);

    const status = opts.employmentStatus ?? 'PERMANENT';
    const probationStart = opts.joiningDate;
    const confirmation = status === 'PERMANENT' ? addDays(opts.joiningDate, 180) : null;
    const religion = pick(RELIGIONS);
    const birthDate = addDays(d(`${TODAY.getUTCFullYear() - randInt(23, 52)}-01-01`), randInt(0, 364));

    const employee = await prisma.employee.create({
      data: {
        employeeVisibleId: String(visibleSeq),
        uniqueTag: `${TENANT.primary.tagPrefix}-${visibleSeq}`,
        username,
        passwordHash,
        firstName: opts.firstName,
        lastName: opts.lastName,
        email: `${username}@${TENANT.primary.domain}`,
        officialEmail: `${username}@${TENANT.primary.domain}`,
        personalEmail: `${username}${randInt(10, 99)}@gmail.example`,
        officialContact: bdPhone(),
        alternateNumber: chance(60) ? bdPhone() : null,
        fatherName: `${pick(MALE_FIRST)} ${opts.lastName}`,
        motherName: `${pick(FEMALE_FIRST)} ${pick(SURNAMES)}`,
        birthDate,
        actualBirthDate: chance(15) ? addDays(birthDate, randInt(-400, 400)) : birthDate,
        gender: opts.gender,
        nationality: 'Bangladeshi',
        countryOfBirth: 'Bangladesh',
        religion,
        maritalStatus: level >= 5 || chance(45) ? 'MARRIED' : 'SINGLE',
        bloodGroup: pick(BLOOD_GROUPS),
        nidNumber: nid(),
        tinNumber: chance(80) ? tin() : null,
        passportNo: chance(35) ? `BX${randInt(1_000_000, 9_999_999)}` : null,
        drivingLicenseNo: chance(20) ? `DL${randInt(100_000, 999_999)}` : null,
        rfid: `RF${String(visibleSeq).padStart(6, '0')}`,
        employmentStatus: status,
        employmentType: level >= 6 ? 'MANAGEMENT' : 'STAFF',
        payrollType: opts.designationName === 'Intern' ? 'HOURLY' : 'SALARIED',
        joiningDate: opts.joiningDate,
        probationStartDate: probationStart,
        confirmationDate: confirmation,
        noticePeriodDays: level >= 6 ? 90 : 30,
        companyId: opts.companyId,
        locationId: opts.locationId,
        departmentId: department.id,
        designationId: designation.id,
        lineManagerId: opts.lineManagerId,
        isLineManager: opts.isLineManager ?? false,
        isHeadOfDepartment: opts.isHeadOfDepartment ?? false,
        lastLoginAt: addDays(TODAY, -randInt(0, 3)),
        roles: { create: { roleId: roles.get(opts.roleKey)! } },
      },
    });

    // A married employee gets a spouse name; keep it consistent with gender.
    if (employee.maritalStatus === 'MARRIED') {
      await prisma.employee.update({
        where: { id: employee.id },
        data: {
          spouseName: `${opts.gender === 'MALE' ? pick(FEMALE_FIRST) : pick(MALE_FIRST)} ${pick(SURNAMES)}`,
          spouseDateOfBirth: addDays(birthDate, randInt(-1500, 1500)),
        },
      });
    }

    const seeded: SeededEmployee = {
      id: employee.id,
      visibleId: employee.employeeVisibleId,
      username,
      firstName: opts.firstName,
      lastName: opts.lastName,
      gender: opts.gender,
      level,
      gross,
      companyId: opts.companyId,
      departmentId: department.id,
      designationId: designation.id,
      locationId: opts.locationId,
      lineManagerId: opts.lineManagerId,
      joiningDate: opts.joiningDate,
      employmentStatus: status,
      isLineManager: opts.isLineManager ?? false,
      email: employee.email,
    };
    employees.push(seeded);
    return seeded;
  }

  function randomName(gender: 'MALE' | 'FEMALE') {
    return {
      firstName: gender === 'MALE' ? pick(MALE_FIRST) : pick(FEMALE_FIRST),
      lastName: pick(SURNAMES),
    };
  }

  const hoLocation = locations[0].id;
  const demoByUsername = new Map(DEMO_ACCOUNTS.map((a) => [a.username, a]));

  // 1 ── Managing Director
  const mdSpec = demoByUsername.get('md')!;
  const md = await createEmployee({
    ...randomName('MALE'),
    firstName: mdSpec.firstName, lastName: mdSpec.lastName, gender: mdSpec.gender,
    designationName: mdSpec.designation, departmentName: mdSpec.department,
    companyId: primary.id, locationId: hoLocation, lineManagerId: null,
    username: 'md', roleKey: mdSpec.role,
    joiningDate: d('2016-01-10'), isLineManager: true, isHeadOfDepartment: true,
  });

  // 2 ── C-level & department heads reporting to the MD
  const headSpecs: { designation: string; department: string; username?: string; role?: string; gender?: 'MALE' | 'FEMALE'; firstName?: string; lastName?: string }[] = [
    { designation: 'Chief Technology Officer', department: 'Technology' },
    { designation: 'Chief Financial Officer', department: 'Finance & Accounts' },
    {
      designation: 'Head of Human Resources', department: 'Human Resources',
      username: 'hr.admin', role: SYSTEM_ROLES.HR_ADMIN, gender: 'FEMALE',
      firstName: 'Nusrat', lastName: 'Jahan',
    },
    { designation: 'Head of Sales', department: 'Sales & Distribution' },
    { designation: 'Head of Supply Chain', department: 'Supply Chain' },
  ];
  const heads: SeededEmployee[] = [];
  for (const spec of headSpecs) {
    const gender = spec.gender ?? (chance(70) ? 'MALE' : 'FEMALE');
    const name = spec.firstName ? { firstName: spec.firstName, lastName: spec.lastName! } : randomName(gender);
    heads.push(
      await createEmployee({
        ...name, gender,
        designationName: spec.designation, departmentName: spec.department,
        companyId: primary.id, locationId: hoLocation, lineManagerId: md.id,
        username: spec.username, roleKey: spec.role ?? SYSTEM_ROLES.LINE_MANAGER,
        joiningDate: addDays(d('2017-03-01'), randInt(0, 900)),
        isLineManager: true, isHeadOfDepartment: true,
      }),
    );
  }
  // Departments without a C-level head report into the nearest one.
  const headByDept = new Map(heads.map((h) => [h.departmentId, h]));

  // 3 ── managers
  const managers: SeededEmployee[] = [];
  const managerDemo = ['admin', 'manager', 'payroll'];
  for (const [deptName, staffing] of Object.entries(DEPT_STAFFING)) {
    const dept = deptByName.get(deptName)!;
    const parent = headByDept.get(dept.id) ?? heads[0];
    for (const designationName of staffing.managers) {
      // Consume a hand-placed demo account where the slot matches.
      const demoKey = managerDemo.find((k) => {
        const a = demoByUsername.get(k)!;
        return a.department === deptName && a.designation === designationName;
      });
      const demo = demoKey ? demoByUsername.get(demoKey)! : undefined;
      if (demo) managerDemo.splice(managerDemo.indexOf(demo.username), 1);

      const gender = demo?.gender ?? (chance(65) ? 'MALE' : 'FEMALE');
      const name = demo ? { firstName: demo.firstName, lastName: demo.lastName } : randomName(gender);
      managers.push(
        await createEmployee({
          ...name, gender,
          designationName, departmentName: deptName,
          companyId: primary.id,
          locationId: deptName === 'Field Force' ? pick(locations.slice(0, 4)).id : hoLocation,
          lineManagerId: parent.id,
          username: demo?.username, roleKey: demo?.role ?? SYSTEM_ROLES.LINE_MANAGER,
          joiningDate: addDays(d('2019-01-01'), randInt(0, 1500)),
          isLineManager: true,
        }),
      );
    }
  }

  // 4 ── individual contributors, filling up to the target headcount
  const icDemo = ['employee', 'field'];
  const deptNames = Object.keys(DEPT_STAFFING);
  let deptCursor = 0;
  while (employees.length < targetCount) {
    const deptName = deptNames[deptCursor % deptNames.length];
    deptCursor += 1;
    const staffing = DEPT_STAFFING[deptName];
    const dept = deptByName.get(deptName)!;
    const deptManagers = managers.filter((m) => m.departmentId === dept.id);
    const manager = deptManagers.length > 0 ? pick(deptManagers) : pick(managers);

    let designationName = pick(staffing.individuals);
    const demoKey = icDemo.find((k) => {
      const a = demoByUsername.get(k)!;
      return a.department === deptName;
    });
    const demo = demoKey ? demoByUsername.get(demoKey)! : undefined;
    if (demo) {
      icDemo.splice(icDemo.indexOf(demo.username), 1);
      designationName = demo.designation;
    }

    const gender = demo?.gender ?? (chance(62) ? 'MALE' : 'FEMALE');
    const name = demo ? { firstName: demo.firstName, lastName: demo.lastName } : randomName(gender);

    // A slice of the workforce is deliberately still on probation so the
    // job-confirmation and onboarding modules have live subjects.
    const isNewJoiner = employees.length > targetCount - 9;
    const joiningDate = isNewJoiner
      ? addDays(TODAY, -randInt(3, 150))
      : addDays(d('2020-06-01'), randInt(0, 1800));
    const status = designationName === 'Intern'
      ? 'INTERN'
      : isNewJoiner ? 'PROBATION' : 'PERMANENT';

    await createEmployee({
      ...name, gender,
      designationName, departmentName: deptName,
      companyId: primary.id,
      locationId: ['Field Force', 'Sales & Distribution'].includes(deptName)
        ? pick(locations.slice(0, 4)).id
        : chance(80) ? hoLocation : pick(locations.slice(0, 4)).id,
      lineManagerId: manager.id,
      username: demo?.username, roleKey: demo?.role ?? SYSTEM_ROLES.EMPLOYEE,
      gross: demo?.gross,
      joiningDate,
      employmentStatus: status as never,
    });
  }
  log('created employees', `${employees.length} across ${DEPARTMENTS.length} departments`);

  // 5 ── department heads on the department rows
  for (const head of heads) {
    await prisma.department.update({
      where: { id: head.departmentId },
      data: { headEmployeeId: head.id },
    });
  }

  // 6 ── dotted lines, team leaders and referrals
  const pool = employees.filter((e) => e.level <= 5);
  for (const emp of pool) {
    const updates: Record<string, unknown> = {};
    if (chance(30)) {
      const dotted = pick(managers.filter((m) => m.id !== emp.lineManagerId));
      if (dotted) updates.dottedManager1Id = dotted.id;
    }
    if (chance(12)) {
      const dotted2 = pick(heads);
      if (dotted2) updates.dottedManager2Id = dotted2.id;
    }
    if (chance(25)) {
      const referrer = pick(employees.filter((e2) => e2.id !== emp.id && e2.joiningDate < emp.joiningDate));
      if (referrer) updates.referringEmployeeId = referrer.id;
    }
    const deptHead = heads.find((h) => h.departmentId === emp.departmentId);
    if (deptHead) updates.headOfDepartmentId = deptHead.id;
    if (Object.keys(updates).length > 0) {
      await prisma.employee.update({ where: { id: emp.id }, data: updates });
    }
  }
  log('wired dotted managers, HoDs and referrals');

  // 7 ── cross-company access for shared-services staff
  const sharedServices = employees.filter((e) =>
    ['hr.admin', 'payroll', 'md', 'admin'].includes(e.username),
  );
  await prisma.employeeCompanyAccess.createMany({
    data: sharedServices.flatMap((e) => [
      { employeeId: e.id, companyId: primary.id },
      { employeeId: e.id, companyId: logistics.id },
    ]),
  });
  log('granted cross-company access', `${sharedServices.length} shared-services staff`);

  // ══ personal detail records ════════════════════════════════════════
  section('Employee detail records');

  const addressRows: any[] = [];
  const emergencyRows: any[] = [];
  const nomineeRows: any[] = [];
  const educationRows: any[] = [];
  const experienceRows: any[] = [];
  const bankRows: any[] = [];
  const benefitRows: any[] = [];
  const documentRows: any[] = [];

  for (const emp of employees) {
    const area = pick(DHAKA_AREAS);
    const homeDistrict = pick(DISTRICTS);
    addressRows.push(
      {
        employeeId: emp.id, kind: 'PRESENT', village: area,
        buildingNo: `House ${randInt(1, 90)}`, streetNo: `Road ${randInt(1, 32)}`,
        city: 'Dhaka', state: 'Dhaka', postalCode: String(randInt(1200, 1230)), country: 'Bangladesh',
      },
      {
        employeeId: emp.id, kind: 'PERMANENT', village: `${pick(['Purba', 'Paschim', 'Uttar', 'Dakshin'])} ${pick(SURNAMES)}para`,
        buildingNo: `Holding ${randInt(1, 200)}`, streetNo: `Ward ${randInt(1, 12)}`,
        city: homeDistrict, state: homeDistrict, postalCode: String(randInt(1000, 9499)), country: 'Bangladesh',
      },
    );

    emergencyRows.push({
      employeeId: emp.id,
      name: `${pick([...MALE_FIRST, ...FEMALE_FIRST])} ${emp.lastName}`,
      relation: pick(['Father', 'Mother', 'Spouse', 'Brother', 'Sister']),
      phone: bdPhone(),
      email: chance(50) ? `emergency${randInt(10, 99)}@gmail.example` : null,
      address: `House ${randInt(1, 90)}, Road ${randInt(1, 32)}, ${area}, Dhaka`,
      isPrimary: true,
    });

    // Nominee shares always total 100%.
    const nomineeCount = chance(35) ? 2 : 1;
    const shares = nomineeCount === 1 ? [100] : [60, 40];
    for (let i = 0; i < nomineeCount; i++) {
      nomineeRows.push({
        employeeId: emp.id,
        name: `${pick([...MALE_FIRST, ...FEMALE_FIRST])} ${pick(SURNAMES)}`,
        relation: i === 0 ? pick(['Spouse', 'Father', 'Mother']) : pick(['Son', 'Daughter', 'Brother']),
        sharePct: shares[i],
        nid: nid(),
        phone: bdPhone(),
        address: `${area}, Dhaka`,
      });
    }

    const degreeCount = emp.level >= 5 ? 2 : 1;
    const degrees = pickN(DEGREES, degreeCount);
    degrees.forEach((deg, i) => {
      educationRows.push({
        employeeId: emp.id,
        degree: deg.degree,
        institute: pick(UNIVERSITIES),
        major: deg.major,
        result: pick(['CGPA 3.92 / 4.00', 'CGPA 3.65 / 4.00', 'CGPA 3.41 / 4.00', 'First Class']),
        passingYear: emp.joiningDate.getUTCFullYear() - randInt(1, 8),
        isHighest: i === degrees.length - 1,
      });
    });

    // Prior experience roughly tracks seniority.
    const priorJobs = Math.max(0, Math.min(3, emp.level - 2));
    let cursor = addDays(emp.joiningDate, -randInt(30, 120));
    for (let i = 0; i < priorJobs; i++) {
      const to = cursor;
      const from = addDays(to, -randInt(400, 1100));
      experienceRows.push({
        employeeId: emp.id,
        companyName: pick(PREV_EMPLOYERS),
        designation: pick(['Officer', 'Executive', 'Senior Officer', 'Engineer', 'Analyst']),
        fromDate: from,
        toDate: to,
        responsibilities: 'Delivered against departmental KPIs and supported cross-functional initiatives.',
      });
      cursor = addDays(from, -randInt(15, 60));
    }

    const bank = pick(BANKS);
    bankRows.push({
      employeeId: emp.id,
      bankName: bank.name,
      branchName: pick(bank.branches),
      accountNo: String(randInt(1_000_000_000_000, 9_999_999_999_999)),
      accountName: `${emp.firstName} ${emp.lastName}`,
      routingNo: String(randInt(100_000_000, 299_999_999)),
      txnType: bank.txn,
      isPrimary: true,
    });

    benefitRows.push({
      employeeId: emp.id,
      isTransportUser: emp.level >= 5 || chance(30),
      isTaxApplicable: emp.gross >= 30_000,
      advanceIncomeTax: chance(12),
      hasInvestment: emp.level >= 5 ? chance(70) : chance(25),
      hasProvidentFund: emp.employmentStatus === 'PERMANENT',
      hasLfa: emp.level >= 6,
      hasGratuity: emp.employmentStatus === 'PERMANENT' && emp.level >= 4,
      hasDormitory: chance(8),
      hasBonus: true,
      hasLifeInsurance: emp.level >= 5,
      hasLunchAllowance: true,
      hasMedicalInsurance: emp.employmentStatus === 'PERMANENT',
      hasMobileAllowance: emp.level >= 4,
    });

    documentRows.push(
      { employeeId: emp.id, kind: 'cv', title: `CV — ${emp.firstName} ${emp.lastName}.pdf`, path: `employees/${emp.visibleId}/cv.pdf`, mimeType: 'application/pdf', sizeBytes: randInt(120_000, 900_000) },
      { employeeId: emp.id, kind: 'nid', title: 'National ID (both sides).pdf', path: `employees/${emp.visibleId}/nid.pdf`, mimeType: 'application/pdf', sizeBytes: randInt(200_000, 700_000) },
      { employeeId: emp.id, kind: 'offer_letter', title: 'Offer Letter.pdf', path: `employees/${emp.visibleId}/offer-letter.pdf`, mimeType: 'application/pdf', sizeBytes: randInt(80_000, 200_000) },
      { employeeId: emp.id, kind: 'appointment_letter', title: 'Appointment Letter.pdf', path: `employees/${emp.visibleId}/appointment-letter.pdf`, mimeType: 'application/pdf', sizeBytes: randInt(80_000, 200_000) },
    );
  }

  await prisma.employeeAddress.createMany({ data: addressRows });
  await prisma.employeeEmergency.createMany({ data: emergencyRows });
  await prisma.employeeNominee.createMany({ data: nomineeRows });
  await prisma.employeeEducation.createMany({ data: educationRows });
  await prisma.employeeExperience.createMany({ data: experienceRows });
  await prisma.employeeBank.createMany({ data: bankRows });
  await prisma.employeeBenefit.createMany({ data: benefitRows });
  await prisma.employeeDocument.createMany({ data: documentRows });
  log('addresses / emergency / nominees', `${addressRows.length} / ${emergencyRows.length} / ${nomineeRows.length}`);
  log('education / experience', `${educationRows.length} / ${experienceRows.length}`);
  log('bank / benefit / documents', `${bankRows.length} / ${benefitRows.length} / ${documentRows.length}`);

  // ── salary & promotion history ─────────────────────────────────────
  const salaryRows: any[] = [];
  const promotionRows: any[] = [];

  for (const emp of employees) {
    // Work backwards from today's gross through annual increments so the
    // JOINING figure is always lower than the current one.
    const yearsOfService = Math.max(
      0,
      Math.floor((TODAY.getTime() - emp.joiningDate.getTime()) / (365.25 * 24 * 3600 * 1000)),
    );
    const incrementCount = Math.min(yearsOfService, 5);

    // The pinned demo employee must have no increment inside FY 2026-27,
    // so the tax statement reproduces the documented example exactly.
    const pinned = emp.username === 'employee';

    let currentGross = emp.gross;
    const points: { effectiveFrom: Date; gross: number; status: string }[] = [];
    for (let i = 0; i < incrementCount; i++) {
      const effectiveFrom = pinned
        ? d(`${TODAY.getUTCFullYear() - i}-04-01`)
        : addMonths(TODAY, -(i * 12 + randInt(1, 6)));
      points.push({
        effectiveFrom,
        gross: round2(currentGross),
        status: i === 0 ? 'INCREMENT' : chance(25) ? 'PROMOTION' : 'INCREMENT',
      });
      currentGross = round2(currentGross / (1 + randInt(8, 18) / 100));
    }
    points.push({ effectiveFrom: emp.joiningDate, gross: round2(currentGross), status: 'JOINING' });
    points.sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());

    let previous: number | null = null;
    for (const point of points) {
      // Deduplicate: two records on the same effective date would violate
      // the (employee, effective_from) uniqueness constraint.
      if (salaryRows.some((r) => r.employeeId === emp.id && iso(r.effectiveFrom) === iso(point.effectiveFrom))) {
        continue;
      }
      salaryRows.push({
        employeeId: emp.id,
        effectiveFrom: point.effectiveFrom,
        gross: point.gross,
        basic: round2(point.gross * 0.5),
        houseRent: round2(point.gross * 0.3),
        conveyance: round2(point.gross * 0.1),
        medical: round2(point.gross * 0.1),
        incrementAmount: previous === null ? null : round2(point.gross - previous),
        incrementPct: previous === null ? null : round2(((point.gross - previous) / previous) * 100),
        status: point.status,
        remarks: point.status === 'JOINING' ? 'Initial appointment' : `Annual review — ${point.status.toLowerCase()}`,
      });
      if (point.status === 'PROMOTION') {
        promotionRows.push({
          employeeId: emp.id,
          effectiveFrom: point.effectiveFrom,
          designationId: emp.designationId,
          departmentId: emp.departmentId,
          companyId: emp.companyId,
          fromDesignation: pick(['Officer', 'Senior Officer', 'Executive', 'Assistant Manager']),
          status: 'PROMOTION',
          remarks: 'Promoted on merit following the annual performance cycle.',
        });
      }
      previous = point.gross;
    }
  }

  await prisma.salaryHistory.createMany({ data: salaryRows });
  await prisma.promotionHistory.createMany({ data: promotionRows });
  log('salary history rows', salaryRows.length);
  log('promotion history rows', promotionRows.length);

  const demoAccounts = DEMO_ACCOUNTS.filter((a) => employees.some((e) => e.username === a.username)).map((a) => {
    const emp = employees.find((e) => e.username === a.username)!;
    return {
      username: a.username,
      role: a.role,
      name: `${emp.firstName} ${emp.lastName}`,
      description: a.description,
    };
  });

  return {
    companies: [primary, logistics].map((c) => ({ id: c.id, alias: c.alias, name: c.name })),
    primaryCompanyId: primary.id,
    locations: locations.map((l) => ({ id: l.id, companyId: l.companyId, alias: l.alias })),
    departments: departments.map((x) => ({ id: x.id, companyId: x.companyId, name: x.name })),
    designations: designations.map((x) => ({
      id: x.id, companyId: x.companyId, name: x.name, level: x.level, grade: x.grade ?? '',
    })),
    employees,
    demoAccounts,
  };
}
