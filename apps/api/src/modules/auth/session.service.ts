import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';

/**
 * Resolves the principal for a request.
 *
 * Deliberately re-read from the database on every request rather than
 * trusted from the JWT: a permission revoked or an account deactivated
 * must take effect immediately, not when the token happens to expire.
 * The reference system cached a permission blob client-side and trusted
 * it — this is the fix for that class of bug.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async loadPrincipal(employeeId: bigint): Promise<SessionPrincipal> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        employeeVisibleId: true,
        username: true,
        active: true,
        companyId: true,
        departmentId: true,
        locationId: true,
        isLineManager: true,
        isHeadOfDepartment: true,
        roles: { select: { role: { select: { key: true, permissions: true } } } },
        companyAccess: { select: { companyId: true } },
        company: { select: { isActive: true, features: { select: { key: true, enabled: true } } } },
      },
    });

    if (!employee) throw new UnauthorizedException('Your account no longer exists.');
    if (!employee.active) throw new UnauthorizedException('Your account has been deactivated.');
    if (!employee.company.isActive) throw new UnauthorizedException('This company is no longer active.');

    const permissions = new Set<string>();
    for (const link of employee.roles) {
      for (const permission of link.role.permissions) permissions.add(permission);
    }

    // Home company is always accessible; explicit grants add to it.
    const accessibleCompanyIds = [
      ...new Set([employee.companyId, ...employee.companyAccess.map((x) => x.companyId)]),
    ];

    const features: Record<string, boolean> = {};
    for (const flag of employee.company.features) features[flag.key] = flag.enabled;

    return {
      id: employee.id,
      employeeVisibleId: employee.employeeVisibleId,
      username: employee.username,
      companyId: employee.companyId,
      departmentId: employee.departmentId,
      locationId: employee.locationId,
      isLineManager: employee.isLineManager,
      isHeadOfDepartment: employee.isHeadOfDepartment,
      roles: employee.roles.map((x) => x.role.key),
      permissions,
      accessibleCompanyIds,
      features,
    };
  }
}
