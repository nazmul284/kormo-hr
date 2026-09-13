import {
  BadRequestException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { getCountryPack, serviceLength } from '@kormo/shared';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { CONFIG, type AppConfig } from '../../common/config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

const BCRYPT_ROUNDS = 10;
/** Bcrypt hash of a throwaway value, compared against on unknown users. */
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8DQ0lWTBmJ2eD5jUmS4pQZ9v0Zw0nS';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Verifies credentials.
   *
   * A missing user still runs a bcrypt comparison against a dummy hash so
   * the response time does not reveal which usernames exist, and the error
   * never distinguishes "no such user" from "wrong password".
   */
  async validateCredentials(identifier: string, password: string) {
    const needle = identifier.trim();
    const employee = await this.prisma.employee.findFirst({
      where: {
        OR: [
          { username: needle.toLowerCase() },
          { email: needle.toLowerCase() },
          { officialEmail: needle.toLowerCase() },
          { employeeVisibleId: needle },
        ],
      },
      select: {
        id: true, username: true, companyId: true, passwordHash: true,
        active: true, mustChangePassword: true, firstName: true, lastName: true,
      },
    });

    if (!employee) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw new UnauthorizedException('Incorrect username or password.');
    }

    const matches = await bcrypt.compare(password, employee.passwordHash);
    if (!matches) throw new UnauthorizedException('Incorrect username or password.');
    if (!employee.active) throw new UnauthorizedException('Your account has been deactivated. Contact HR.');

    return employee;
  }

  async login(
    identifier: string,
    password: string,
    context: { userAgent?: string; ip?: string },
  ) {
    const employee = await this.validateCredentials(identifier, password);

    const [accessToken, refresh] = await Promise.all([
      this.tokens.issueAccessToken(employee),
      this.tokens.issueRefreshToken(employee.id, context),
    ]);

    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { lastLoginAt: new Date() },
    });

    const principal = await this.sessions.loadPrincipal(employee.id);
    const user = await this.buildSessionUser(principal);

    this.logger.log(`login ${employee.username} (#${employee.id})`);
    return {
      accessToken,
      refreshToken: refresh.token,
      user,
      mustChangePassword: employee.mustChangePassword,
    };
  }

  async refresh(refreshToken: string, context: { userAgent?: string; ip?: string }) {
    const rotated = await this.tokens.rotateRefreshToken(refreshToken, context);
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: rotated.employeeId },
      select: { id: true, username: true, companyId: true },
    });
    const accessToken = await this.tokens.issueAccessToken(employee);
    const principal = await this.sessions.loadPrincipal(employee.id);
    return {
      accessToken,
      refreshToken: rotated.refreshToken,
      user: await this.buildSessionUser(principal),
    };
  }

  async logout(refreshToken?: string): Promise<void> {
    if (refreshToken) await this.tokens.revokeToken(refreshToken);
  }

  async changePassword(employeeId: bigint, currentPassword: string, newPassword: string) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { passwordHash: true },
    });

    const matches = await bcrypt.compare(currentPassword, employee.passwordHash);
    if (!matches) throw new BadRequestException('Your current password is incorrect.');

    this.assertPasswordStrength(newPassword);
    if (await bcrypt.compare(newPassword, employee.passwordHash)) {
      throw new BadRequestException('Your new password must be different from the current one.');
    }

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
        mustChangePassword: false,
      },
    });

    // Changing a password should end every other session.
    await this.tokens.revokeAllForEmployee(employeeId);
    return { changed: true };
  }

  /**
   * Starts a reset. Always reports success: telling an anonymous caller
   * whether an address is registered is an account-enumeration hole.
   */
  async requestPasswordReset(identifier: string) {
    const needle = identifier.trim().toLowerCase();
    const employee = await this.prisma.employee.findFirst({
      where: {
        active: true,
        OR: [{ username: needle }, { email: needle }, { officialEmail: needle }],
      },
      select: { id: true, email: true },
    });

    if (!employee) {
      return { requested: true };
    }

    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        employeeId: employee.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // A mail transport belongs behind an outbound queue; in development
    // the token is logged so the flow is exercisable end to end.
    if (this.config.nodeEnv !== 'production') {
      this.logger.warn(`[dev] password reset token for ${employee.email}: ${token}`);
    }

    return { requested: true, ...(this.config.nodeEnv !== 'production' ? { devToken: token } : {}) };
  }

  async resetPassword(token: string, newPassword: string) {
    this.assertPasswordStrength(newPassword);

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt !== null || record.expiresAt < new Date()) {
      throw new BadRequestException('That reset link is invalid or has expired.');
    }

    await this.prisma.$transaction([
      this.prisma.employee.update({
        where: { id: record.employeeId },
        data: {
          passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
          mustChangePassword: false,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await this.tokens.revokeAllForEmployee(record.employeeId);
    return { reset: true };
  }

  /** Admin-triggered reset: forces a change on next sign-in. */
  async adminResetPassword(targetId: bigint) {
    const temporary = `Kormo-${randomBytes(4).toString('hex')}`;
    await this.prisma.employee.update({
      where: { id: targetId },
      data: {
        passwordHash: await bcrypt.hash(temporary, BCRYPT_ROUNDS),
        mustChangePassword: true,
      },
    });
    await this.tokens.revokeAllForEmployee(targetId);
    return { temporaryPassword: temporary };
  }

  private assertPasswordStrength(password: string): void {
    const problems: string[] = [];
    if (password.length < 8) problems.push('be at least 8 characters long');
    if (!/[A-Za-z]/.test(password)) problems.push('contain a letter');
    if (!/\d/.test(password)) problems.push('contain a digit');
    if (problems.length > 0) {
      throw new BadRequestException(`Your password must ${problems.join(', ')}.`);
    }
  }

  /** The identity + capability blob the client renders its shell from. */
  async buildSessionUser(principal: SessionPrincipal) {
    const [employee, directReportCount, companies] = await Promise.all([
      this.prisma.employee.findUniqueOrThrow({
        where: { id: principal.id },
        select: {
          id: true, employeeVisibleId: true, username: true,
          firstName: true, lastName: true, email: true, officialEmail: true,
          officialContact: true, joiningDate: true, lastLoginAt: true,
          isLineManager: true, thumbnailsPath01: true,
          designation: { select: { name: true, grade: true } },
          department: { select: { id: true, name: true } },
          company: {
            select: {
              id: true, name: true, alias: true,
              country: true, timezone: true, locale: true, weekendDays: true,
              fiscalYearStartMonth: true,
            },
          },
          location: { select: { id: true, name: true } },
        },
      }),
      this.prisma.employee.count({ where: { lineManagerId: principal.id, active: true } }),
      this.prisma.company.findMany({
        where: { id: { in: principal.accessibleCompanyIds } },
        select: { id: true, name: true, alias: true },
        orderBy: { id: 'asc' },
      }),
    ]);

    const pack = getCountryPack(employee.company.country);

    return {
      id: employee.id,
      employeeVisibleId: employee.employeeVisibleId,
      username: employee.username,
      firstName: employee.firstName,
      lastName: employee.lastName,
      fullName: `${employee.firstName} ${employee.lastName}`,
      email: employee.email,
      officialEmail: employee.officialEmail,
      officialContact: employee.officialContact,
      avatarUrl: employee.thumbnailsPath01,
      designation: employee.designation?.name ?? null,
      designationGrade: employee.designation?.grade ?? null,
      department: employee.department?.name ?? null,
      departmentId: employee.department?.id ?? null,
      company: {
        id: employee.company.id,
        name: employee.company.name,
        alias: employee.company.alias,
      },
      /**
       * How this tenant renders money, dates and weeks.
       *
       * Shipped with the session rather than fetched separately because
       * the very first screen paints money: a second round trip would
       * mean either a flash of the wrong currency or a spinner over the
       * whole dashboard.
       */
      locale: {
        country: pack.code,
        countryName: pack.name,
        currency: pack.currency,
        timezone: employee.company.timezone || pack.timezone,
        locale: employee.company.locale || pack.locale,
        weekendDays: employee.company.weekendDays ?? pack.weekendDays,
        fiscalYearStartMonth: employee.company.fiscalYearStartMonth,
      },
      location: employee.location,
      joiningDate: employee.joiningDate,
      serviceLength: serviceLength(employee.joiningDate).label,
      lastLoginAt: employee.lastLoginAt,
      isLineManager: employee.isLineManager || directReportCount > 0,
      directReportCount,
      roles: principal.roles,
      // UI hints only — every route re-authorises server-side.
      permissions: [...principal.permissions].sort(),
      features: principal.features,
      accessibleCompanies: companies,
    };
  }
}
