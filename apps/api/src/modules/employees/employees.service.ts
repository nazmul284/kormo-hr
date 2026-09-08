import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PERMISSIONS, initials, serviceLength } from '@kormo/shared';
import { Prisma } from '@prisma/client';

import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';
import {
  assertCanViewEmployee, collectManagerChain, companyFilter, employeeScopeWhere, resolveScope,
} from '../../common/utils/scope';
import { addDays, dateOnly } from '../../common/utils/dates';
import type {
  ChangeRequestDto, DirectoryQuery, EmployeeListQuery, HierarchyQuery, ReviewChangeRequestDto,
} from './dto';

/** Fields safe to expose in the co-worker directory to anyone signed in. */
const DIRECTORY_SELECT = {
  id: true,
  employeeVisibleId: true,
  firstName: true,
  lastName: true,
  officialEmail: true,
  email: true,
  officialContact: true,
  thumbnailsPath01: true,
  designation: { select: { name: true } },
  department: { select: { id: true, name: true } },
  company: { select: { id: true, name: true, alias: true } },
  location: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeSelect;

const TREE_NODE_SELECT = {
  id: true,
  employeeVisibleId: true,
  firstName: true,
  lastName: true,
  thumbnailsPath01: true,
  lineManagerId: true,
  designation: { select: { name: true, grade: true, level: true } },
  department: { select: { id: true, name: true } },
  company: { select: { id: true, name: true, alias: true } },
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── list & directory ───────────────────────────────────────────────

  async list(user: SessionPrincipal, query: EmployeeListQuery) {
    const scope = resolveScope(user, {
      all: PERMISSIONS.EMPLOYEE_READ_ALL,
      team: PERMISSIONS.EMPLOYEE_READ_TEAM,
    });
    const scopeWhere = await employeeScopeWhere(
      this.prisma,
      user,
      query.myTeamOnly && scope === 'all' ? 'team' : scope,
    );

    const where: Prisma.EmployeeWhereInput = {
      AND: [
        scopeWhere,
        { companyId: { in: companyFilter(user, query.companyId) } },
        query.departmentId ? { departmentId: query.departmentId } : {},
        query.designationId ? { designationId: query.designationId } : {},
        query.locationId ? { locationId: query.locationId } : {},
        query.employmentStatus ? { employmentStatus: query.employmentStatus as never } : {},
        query.activeOnly !== false ? { active: true } : {},
        query.search ? this.searchClause(query.search) : {},
      ],
    };

    const orderBy: Prisma.EmployeeOrderByWithRelationInput[] =
      query.sortBy === 'name'
        ? [{ firstName: query.sortDir }, { lastName: query.sortDir }]
        : query.sortBy === 'designation'
          ? [{ designation: { level: query.sortDir } }]
          : [{ [query.sortBy]: query.sortDir } as Prisma.EmployeeOrderByWithRelationInput];

    const [rows, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        select: {
          ...DIRECTORY_SELECT,
          joiningDate: true,
          employmentStatus: true,
          employmentType: true,
          active: true,
          isLineManager: true,
          lineManager: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy,
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return paginate(rows.map((row) => this.decorate(row)), total, query);
  }

  /** Co-worker contact directory — company-wide by design, but read-only. */
  async directory(user: SessionPrincipal, query: DirectoryQuery) {
    const where: Prisma.EmployeeWhereInput = {
      active: true,
      companyId: { in: companyFilter(user, query.companyId) },
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.search ? this.searchClause(query.search) : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        select: DIRECTORY_SELECT,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return paginate(rows.map((row) => this.decorate(row)), total, query);
  }

  private searchClause(search: string): Prisma.EmployeeWhereInput {
    const term = search.trim();
    return {
      OR: [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { employeeVisibleId: { contains: term } },
        { officialEmail: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { officialContact: { contains: term } },
        { designation: { name: { contains: term, mode: 'insensitive' } } },
        { department: { name: { contains: term, mode: 'insensitive' } } },
      ],
    };
  }

  private decorate<T extends { firstName: string; lastName: string }>(row: T) {
    return {
      ...row,
      fullName: `${row.firstName} ${row.lastName}`,
      initials: initials(row.firstName, row.lastName),
    };
  }

  // ── profile ────────────────────────────────────────────────────────

  /**
   * The profile header plus the Company Details tab. Compensation is a
   * separate call because it needs its own permission — a line manager
   * can see a report's profile without seeing their salary.
   */
  async getProfile(user: SessionPrincipal, targetId: bigint) {
    await assertCanViewEmployee(this.prisma, user, targetId);

    const employee = await this.prisma.employee.findUnique({
      where: { id: targetId },
      select: {
        id: true, employeeVisibleId: true, uniqueTag: true, username: true, active: true,
        firstName: true, lastName: true, aliasName: true,
        email: true, officialEmail: true, personalEmail: true, alternateEmail: true,
        officialContact: true, alternateNumber: true,
        employmentStatus: true, employmentType: true, payrollType: true,
        joiningDate: true, probationStartDate: true, confirmationDate: true,
        contractEndDate: true, noticePeriodDays: true, separationDate: true,
        rfid: true, profilePicPath: true, thumbnailsPath01: true, thumbnailsPath02: true,
        lastLoginAt: true, createdAt: true,
        company: { select: { id: true, name: true, alias: true } },
        location: { select: { id: true, name: true, alias: true } },
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true, grade: true, level: true } },
        lineManager: { select: { id: true, firstName: true, lastName: true, employeeVisibleId: true, designation: { select: { name: true } } } },
        dottedManager1: { select: { id: true, firstName: true, lastName: true, designation: { select: { name: true } } } },
        dottedManager2: { select: { id: true, firstName: true, lastName: true, designation: { select: { name: true } } } },
        referringEmployee: { select: { id: true, firstName: true, lastName: true } },
        headOfDepartment: { select: { id: true, firstName: true, lastName: true } },
        roster: { select: { id: true, name: true } },
        leavePolicy: { select: { id: true, name: true } },
        emergencyContacts: true,
        _count: { select: { directReports: true } },
      },
    });

    if (!employee) throw new NotFoundException('Employee not found.');

    const isSelf = targetId === user.id;

    return {
      ...employee,
      fullName: `${employee.firstName} ${employee.lastName}`,
      initials: initials(employee.firstName, employee.lastName),
      // The "Service Length" field, computed rather than stored so it is
      // never stale.
      serviceLength: serviceLength(employee.joiningDate),
      directReportCount: employee._count.directReports,
      capabilities: {
        canEditSelf: isSelf,
        canViewCompensation:
          isSelf || user.permissions.has(PERMISSIONS.SALARY_READ),
        canViewDocuments: isSelf || user.permissions.has(PERMISSIONS.EMPLOYEE_READ_ALL),
        canResetPassword: user.permissions.has(PERMISSIONS.EMPLOYEE_WRITE),
      },
    };
  }

  async getPersonalDetails(user: SessionPrincipal, targetId: bigint) {
    await assertCanViewEmployee(this.prisma, user, targetId);

    const [employee, addresses] = await Promise.all([
      this.prisma.employee.findUniqueOrThrow({
        where: { id: targetId },
        select: {
          fatherName: true, motherName: true, birthDate: true, actualBirthDate: true,
          gender: true, nationality: true, countryOfBirth: true, religion: true,
          maritalStatus: true, bloodGroup: true, spouseName: true, spouseDateOfBirth: true,
          nidNumber: true, tinNumber: true, passportNo: true, drivingLicenseNo: true,
          personalEmail: true, alternateEmail: true, alternateNumber: true,
        },
      }),
      this.prisma.employeeAddress.findMany({ where: { employeeId: targetId } }),
    ]);

    return {
      ...employee,
      presentAddress: addresses.find((a) => a.kind === 'PRESENT') ?? null,
      permanentAddress: addresses.find((a) => a.kind === 'PERMANENT') ?? null,
    };
  }

  /**
   * Compensation tab. Gated separately: salary is the most sensitive
   * field in the system, and "can see the profile" must not imply
   * "can see the pay".
   */
  async getCompensation(user: SessionPrincipal, targetId: bigint) {
    const isSelf = targetId === user.id;
    if (!isSelf && !user.permissions.has(PERMISSIONS.SALARY_READ)) {
      throw new ForbiddenException('You do not have permission to view compensation details.');
    }
    await assertCanViewEmployee(this.prisma, user, targetId);

    const [banks, benefit, salaryHistory, promotions] = await Promise.all([
      this.prisma.employeeBank.findMany({ where: { employeeId: targetId } }),
      this.prisma.employeeBenefit.findUnique({ where: { employeeId: targetId } }),
      this.prisma.salaryHistory.findMany({
        where: { employeeId: targetId },
        orderBy: { effectiveFrom: 'desc' },
      }),
      this.prisma.promotionHistory.findMany({
        where: { employeeId: targetId },
        orderBy: { effectiveFrom: 'desc' },
        include: { designation: { select: { name: true, grade: true } } },
      }),
    ]);

    return {
      bankAccounts: banks,
      benefit,
      salaryHistory,
      promotionHistory: promotions,
      currentGross: salaryHistory[0]?.gross ?? null,
    };
  }

  async getNominees(user: SessionPrincipal, targetId: bigint) {
    await assertCanViewEmployee(this.prisma, user, targetId);
    const nominees = await this.prisma.employeeNominee.findMany({ where: { employeeId: targetId } });
    const totalShare = nominees.reduce((sum, n) => sum + Number(n.sharePct), 0);
    return {
      nominees,
      totalSharePct: totalShare,
      // Surfaced rather than silently tolerated: a nomination that does
      // not total 100% will stall a provident-fund payout.
      isValid: nominees.length === 0 || Math.abs(totalShare - 100) < 0.01,
    };
  }

  async getEducationAndExperience(user: SessionPrincipal, targetId: bigint) {
    await assertCanViewEmployee(this.prisma, user, targetId);
    const [education, experience] = await Promise.all([
      this.prisma.employeeEducation.findMany({
        where: { employeeId: targetId },
        orderBy: { passingYear: 'desc' },
      }),
      this.prisma.employeeExperience.findMany({
        where: { employeeId: targetId },
        orderBy: { fromDate: 'desc' },
      }),
    ]);
    return { education, experience };
  }

  async getDocuments(user: SessionPrincipal, targetId: bigint) {
    const isSelf = targetId === user.id;
    if (!isSelf && !user.permissions.has(PERMISSIONS.EMPLOYEE_READ_ALL)) {
      throw new ForbiddenException('You do not have permission to view these documents.');
    }
    await assertCanViewEmployee(this.prisma, user, targetId);
    return this.prisma.employeeDocument.findMany({
      where: { employeeId: targetId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  // ── org tree ───────────────────────────────────────────────────────

  /**
   * Employee tree, expanded a level at a time.
   *
   * The system this replaces dumped the whole tree and then fired one
   * avatar request per node (~40 on a single page). Here each call
   * returns `maxLevel` levels and reports `hasChildren`, so the client
   * expands on demand.
   */
  async getEmployeeTree(user: SessionPrincipal, rootId: bigint, query: HierarchyQuery) {
    await assertCanViewEmployee(this.prisma, user, rootId).catch(() => {
      // The org chart is intentionally readable company-wide; only the
      // company boundary is enforced.
      return undefined;
    });

    const root = await this.prisma.employee.findUnique({
      where: { id: rootId },
      select: TREE_NODE_SELECT,
    });
    if (!root) throw new NotFoundException('Employee not found.');
    if (!user.accessibleCompanyIds.includes(root.company.id)) {
      throw new ForbiddenException('That employee belongs to a company you do not have access to.');
    }

    const upperChain = query.generateUpperTree
      ? await this.getManagerChainNodes(rootId)
      : [];

    const tree = await this.expandSubtree(rootId, Math.min(query.maxLevel, 6));

    return {
      root: { ...this.treeNode(root), children: tree.children, hasChildren: tree.hasChildren },
      /** Managers above the root, nearest first. */
      upperChain,
      maxLevel: query.maxLevel,
    };
  }

  private async expandSubtree(
    parentId: bigint,
    depth: number,
  ): Promise<{ children: unknown[]; hasChildren: boolean }> {
    const children = await this.prisma.employee.findMany({
      where: { lineManagerId: parentId, active: true },
      select: { ...TREE_NODE_SELECT, _count: { select: { directReports: true } } },
      orderBy: [{ designation: { level: 'desc' } }, { firstName: 'asc' }],
    });

    if (children.length === 0) return { children: [], hasChildren: false };
    if (depth <= 1) {
      return {
        children: children.map((child) => ({
          ...this.treeNode(child),
          children: [],
          hasChildren: child._count.directReports > 0,
        })),
        hasChildren: true,
      };
    }

    const expanded: unknown[] = [];
    for (const child of children) {
      const nested = await this.expandSubtree(child.id, depth - 1);
      expanded.push({
        ...this.treeNode(child),
        children: nested.children,
        hasChildren: child._count.directReports > 0,
      });
    }
    return { children: expanded, hasChildren: true };
  }

  private async getManagerChainNodes(employeeId: bigint) {
    const chain = await collectManagerChain(this.prisma, employeeId);
    if (chain.length === 0) return [];
    const nodes = await this.prisma.employee.findMany({
      where: { id: { in: chain } },
      select: TREE_NODE_SELECT,
    });
    // Preserve nearest-manager-first ordering, which findMany does not.
    const byId = new Map(nodes.map((n) => [String(n.id), n]));
    return chain
      .map((id) => byId.get(String(id)))
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .map((n) => this.treeNode(n));
  }

  private treeNode(row: {
    id: bigint;
    employeeVisibleId: string;
    firstName: string;
    lastName: string;
    thumbnailsPath01: string | null;
    designation: { name: string; grade: string | null; level: number } | null;
    department: { id: number; name: string } | null;
    company: { id: number; name: string; alias: string };
  }) {
    return {
      id: row.id,
      employeeVisibleId: row.employeeVisibleId,
      fullName: `${row.firstName} ${row.lastName}`,
      initials: initials(row.firstName, row.lastName),
      avatarUrl: row.thumbnailsPath01,
      designation: row.designation?.name ?? null,
      grade: row.designation?.grade ?? null,
      level: row.designation?.level ?? 0,
      department: row.department?.name ?? null,
      departmentId: row.department?.id ?? null,
      company: row.company.name,
      companyId: row.company.id,
    };
  }

  /** Department tree, with headcount and the department head per node. */
  async getDepartmentTree(user: SessionPrincipal, companyId?: number) {
    const companyIds = companyFilter(user, companyId);
    const departments = await this.prisma.department.findMany({
      where: { companyId: { in: companyIds }, isActive: true },
      select: {
        id: true, name: true, code: true, parentDepartmentId: true, companyId: true,
        headEmployeeId: true,
        _count: { select: { employees: { where: { active: true } } } },
      },
      orderBy: { name: 'asc' },
    });

    const headIds = departments
      .map((d) => d.headEmployeeId)
      .filter((x): x is bigint => x !== null);
    const heads = headIds.length
      ? await this.prisma.employee.findMany({
          where: { id: { in: headIds } },
          select: { id: true, firstName: true, lastName: true, thumbnailsPath01: true, designation: { select: { name: true } } },
        })
      : [];
    const headById = new Map(heads.map((h) => [String(h.id), h]));

    const nodes = departments.map((dept) => {
      const head = dept.headEmployeeId ? headById.get(String(dept.headEmployeeId)) : undefined;
      return {
        id: dept.id,
        name: dept.name,
        code: dept.code,
        companyId: dept.companyId,
        parentDepartmentId: dept.parentDepartmentId,
        headcount: dept._count.employees,
        head: head
          ? {
              id: head.id,
              fullName: `${head.firstName} ${head.lastName}`,
              initials: initials(head.firstName, head.lastName),
              designation: head.designation?.name ?? null,
              avatarUrl: head.thumbnailsPath01,
            }
          : null,
        children: [] as unknown[],
      };
    });

    // Assemble the forest in one pass.
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const roots: typeof nodes = [];
    for (const node of nodes) {
      const parent = node.parentDepartmentId ? byId.get(node.parentDepartmentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    return {
      tree: roots,
      totalDepartments: nodes.length,
      totalHeadcount: nodes.reduce((sum, n) => sum + n.headcount, 0),
    };
  }

  // ── self-service change requests ───────────────────────────────────

  /** Which fields this employee may edit, and which apply immediately. */
  async getAllowedFields(user: SessionPrincipal, targetId: bigint) {
    await assertCanViewEmployee(this.prisma, user, targetId);
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: targetId },
      select: { companyId: true },
    });

    // An employee-specific override wins over the company default.
    const config =
      (await this.prisma.profileUpdateConfig.findFirst({
        where: { companyId: employee.companyId, employeeId: targetId },
      })) ??
      (await this.prisma.profileUpdateConfig.findFirst({
        where: { companyId: employee.companyId, employeeId: null },
      }));

    return {
      allowedFields: config?.allowedFields ?? [],
      autoApprove: config?.autoApprove ?? [],
      requiresApproval: (config?.allowedFields ?? []).filter(
        (field) => !(config?.autoApprove ?? []).includes(field),
      ),
    };
  }

  async createChangeRequest(user: SessionPrincipal, dto: ChangeRequestDto) {
    const allowed = await this.getAllowedFields(user, user.id);
    if (!allowed.allowedFields.includes(dto.fieldPath)) {
      throw new BadRequestException(
        `"${dto.fieldPath}" is not a field you can request a change to. Contact HR instead.`,
      );
    }

    const existing = await this.prisma.profileChangeRequest.findFirst({
      where: { employeeId: user.id, fieldPath: dto.fieldPath, status: 'PENDING' },
    });
    if (existing) {
      throw new BadRequestException(
        `You already have a pending change request for ${dto.fieldPath}.`,
      );
    }

    const current = await this.readCurrentValue(user.id, dto.fieldPath);

    // Low-risk fields apply straight away; everything else queues for HR.
    if (allowed.autoApprove.includes(dto.fieldPath)) {
      await this.applyChange(user.id, dto.fieldPath, dto.requestedValue);
      return this.prisma.profileChangeRequest.create({
        data: {
          employeeId: user.id,
          fieldPath: dto.fieldPath,
          currentValue: current,
          requestedValue: dto.requestedValue,
          reason: dto.reason,
          status: 'APPROVED',
          reviewNote: 'Applied automatically — field is self-serviceable.',
          reviewedAt: new Date(),
        },
      });
    }

    return this.prisma.profileChangeRequest.create({
      data: {
        employeeId: user.id,
        fieldPath: dto.fieldPath,
        currentValue: current,
        requestedValue: dto.requestedValue,
        reason: dto.reason,
      },
    });
  }

  async listMyChangeRequests(user: SessionPrincipal) {
    return this.prisma.profileChangeRequest.findMany({
      where: { employeeId: user.id },
      orderBy: { requestedAt: 'desc' },
      include: { reviewer: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async listPendingChangeRequests(user: SessionPrincipal) {
    const rows = await this.prisma.profileChangeRequest.findMany({
      where: {
        status: 'PENDING',
        employee: { companyId: { in: user.accessibleCompanyIds } },
      },
      orderBy: { requestedAt: 'asc' },
      include: {
        employee: {
          select: {
            id: true, employeeVisibleId: true, firstName: true, lastName: true,
            department: { select: { name: true } },
            designation: { select: { name: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      ...row,
      employee: this.decorate(row.employee),
    }));
  }

  async reviewChangeRequest(user: SessionPrincipal, requestId: number, dto: ReviewChangeRequestDto) {
    const request = await this.prisma.profileChangeRequest.findUnique({
      where: { id: requestId },
      include: { employee: { select: { companyId: true } } },
    });
    if (!request) throw new NotFoundException('Change request not found.');
    if (!user.accessibleCompanyIds.includes(request.employee.companyId)) {
      throw new ForbiddenException('That request belongs to a company you do not have access to.');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('That request has already been reviewed.');
    }

    if (dto.decision === 'APPROVED') {
      await this.applyChange(request.employeeId, request.fieldPath, request.requestedValue);
    }

    const updated = await this.prisma.profileChangeRequest.update({
      where: { id: requestId },
      data: {
        status: dto.decision,
        reviewerId: user.id,
        reviewNote: dto.reviewNote,
        reviewedAt: new Date(),
      },
    });

    await this.prisma.notification.create({
      data: {
        employeeId: request.employeeId,
        kind: 'APPROVAL',
        title: `Your profile change request was ${dto.decision.toLowerCase()}`,
        body: `${request.fieldPath}${dto.reviewNote ? ` — ${dto.reviewNote}` : ''}`,
        link: '/profile',
        entityType: 'profile_change_request',
        entityId: String(requestId),
      },
    });

    return updated;
  }

  private async readCurrentValue(employeeId: bigint, fieldPath: string): Promise<string | null> {
    if (fieldPath === 'presentAddress') {
      const address = await this.prisma.employeeAddress.findUnique({
        where: { employeeId_kind: { employeeId, kind: 'PRESENT' } },
      });
      return address
        ? [address.buildingNo, address.streetNo, address.village, address.city].filter(Boolean).join(', ')
        : null;
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { personalEmail: true, alternateEmail: true, alternateNumber: true,
        maritalStatus: true, spouseName: true, spouseDateOfBirth: true, bloodGroup: true },
    });
    const value = (employee as Record<string, unknown> | null)?.[fieldPath];
    if (value === null || value === undefined) return null;
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  }

  /**
   * Applies an approved change.
   *
   * Only an explicit whitelist of columns is writable here — the field
   * name arrives from the client, so passing it into Prisma unchecked
   * would be a mass-assignment hole straight onto the employee record.
   */
  private async applyChange(employeeId: bigint, fieldPath: string, value: string): Promise<void> {
    const SCALARS: Record<string, 'string' | 'date' | 'enum'> = {
      personalEmail: 'string',
      alternateEmail: 'string',
      alternateNumber: 'string',
      spouseName: 'string',
      spouseDateOfBirth: 'date',
      maritalStatus: 'enum',
      bloodGroup: 'enum',
    };

    if (fieldPath === 'presentAddress') {
      const parts = value.split(',').map((x) => x.trim());
      await this.prisma.employeeAddress.upsert({
        where: { employeeId_kind: { employeeId, kind: 'PRESENT' } },
        create: {
          employeeId, kind: 'PRESENT',
          buildingNo: parts[0] ?? null, streetNo: parts[1] ?? null,
          village: parts[2] ?? null, city: parts[3] ?? 'Dhaka', country: 'Bangladesh',
        },
        update: {
          buildingNo: parts[0] ?? null, streetNo: parts[1] ?? null,
          village: parts[2] ?? null, city: parts[3] ?? 'Dhaka',
        },
      });
      return;
    }

    const kind = SCALARS[fieldPath];
    if (!kind) {
      throw new BadRequestException(`"${fieldPath}" cannot be updated through self-service.`);
    }

    const data: Record<string, unknown> = {
      [fieldPath]: kind === 'date' ? dateOnly(value) : value,
    };
    await this.prisma.employee.update({ where: { id: employeeId }, data });
  }

  // ── dashboard-adjacent people queries ──────────────────────────────

  async birthdays(user: SessionPrincipal, scope: 'today' | 'month' = 'today') {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();

    // Postgres date parts are the cheap way to ask "whose birthday is
    // today" without loading every employee.
    const rows = await this.prisma.$queryRaw<
      { employee_id: bigint; first_name: string; last_name: string; birth_date: Date; designation: string | null; thumb: string | null; day_of_month: number }[]
    >`
      SELECT e.employee_id, e.first_name, e.last_name, e.birth_date,
             d.name AS designation, e.thumbnails_path_01 AS thumb,
             EXTRACT(DAY FROM e.birth_date)::int AS day_of_month
      FROM employee e
      LEFT JOIN designation d ON d.designation_id = e.designation_id
      WHERE e.active = true
        AND e.company_id = ANY(${user.accessibleCompanyIds})
        AND e.birth_date IS NOT NULL
        AND EXTRACT(MONTH FROM e.birth_date) = ${month}
        ${scope === 'today' ? Prisma.sql`AND EXTRACT(DAY FROM e.birth_date) = ${day}` : Prisma.empty}
      ORDER BY EXTRACT(DAY FROM e.birth_date) ASC, e.first_name ASC
    `;

    return rows.map((row) => ({
      id: row.employee_id,
      fullName: `${row.first_name} ${row.last_name}`,
      initials: initials(row.first_name, row.last_name),
      designation: row.designation,
      avatarUrl: row.thumb,
      dayOfMonth: row.day_of_month,
      isToday: row.day_of_month === day,
    }));
  }

  async anniversaries(user: SessionPrincipal, scope: 'today' | 'month' = 'month') {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();

    const rows = await this.prisma.$queryRaw<
      { employee_id: bigint; first_name: string; last_name: string; joining_date: Date; designation: string | null; thumb: string | null; day_of_month: number; years: number }[]
    >`
      SELECT e.employee_id, e.first_name, e.last_name, e.joining_date,
             d.name AS designation, e.thumbnails_path_01 AS thumb,
             EXTRACT(DAY FROM e.joining_date)::int AS day_of_month,
             (EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM e.joining_date))::int AS years
      FROM employee e
      LEFT JOIN designation d ON d.designation_id = e.designation_id
      WHERE e.active = true
        AND e.company_id = ANY(${user.accessibleCompanyIds})
        AND EXTRACT(MONTH FROM e.joining_date) = ${month}
        AND e.joining_date < CURRENT_DATE
        ${scope === 'today' ? Prisma.sql`AND EXTRACT(DAY FROM e.joining_date) = ${day}` : Prisma.empty}
      ORDER BY EXTRACT(DAY FROM e.joining_date) ASC
    `;

    return rows
      // Someone who joined earlier this month has no anniversary yet.
      .filter((row) => row.years >= 1)
      .map((row) => ({
        id: row.employee_id,
        fullName: `${row.first_name} ${row.last_name}`,
        initials: initials(row.first_name, row.last_name),
        designation: row.designation,
        avatarUrl: row.thumb,
        joiningDate: row.joining_date,
        years: row.years,
        dayOfMonth: row.day_of_month,
        isToday: row.day_of_month === day,
      }));
  }

  /** Direct reports, for the manager's "my team" views. */
  async myTeam(user: SessionPrincipal) {
    const rows = await this.prisma.employee.findMany({
      where: { lineManagerId: user.id, active: true },
      select: {
        ...DIRECTORY_SELECT,
        joiningDate: true,
        employmentStatus: true,
        _count: { select: { directReports: true } },
      },
      orderBy: [{ firstName: 'asc' }],
    });
    return rows.map((row) => this.decorate(row));
  }
}
