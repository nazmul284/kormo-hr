import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';

import { CONFIG, type AppConfig } from '../../common/config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  username: string;
  companyId: number;
  /** Token type, so a refresh token can never be replayed as an access token. */
  typ: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  fam: string;
  typ: 'refresh';
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /** Only the hash is persisted, so a database leak yields no live sessions. */
  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issueAccessToken(employee: { id: bigint; username: string; companyId: number }): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: String(employee.id),
      username: employee.username,
      companyId: employee.companyId,
      typ: 'access',
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.jwt.accessSecret,
      // `expiresIn` is typed as a `ms` template-literal union upstream;
      // our TTLs come from configuration, so assert the option shape.
      expiresIn: this.config.jwt.accessTtl,
    } as JwtSignOptions);
  }

  async issueRefreshToken(
    employeeId: bigint,
    context: { userAgent?: string; ip?: string; familyId?: string },
  ): Promise<{ token: string; jti: string; familyId: string }> {
    const jti = randomUUID();
    // A family groups every rotation of one login, so detecting reuse can
    // revoke the whole lineage rather than a single token.
    const familyId = context.familyId ?? randomUUID();

    const payload: RefreshTokenPayload = {
      sub: String(employeeId),
      jti,
      fam: familyId,
      typ: 'refresh',
    };
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.jwt.refreshSecret,
      expiresIn: this.config.jwt.refreshTtl,
    } as JwtSignOptions);

    const decoded = this.jwt.decode(token) as { exp: number };
    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        employeeId,
        tokenHash: this.hash(token),
        familyId,
        userAgent: context.userAgent?.slice(0, 255),
        ip: context.ip,
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return { token, jti, familyId };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.jwt.accessSecret,
      });
      if (payload.typ !== 'access') throw new Error('wrong token type');
      return payload;
    } catch {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }
  }

  /**
   * Verifies a refresh token and rotates it.
   *
   * Presenting a token that has already been rotated means it leaked (or
   * was replayed), so the entire family is revoked and the user has to
   * sign in again. That is the whole point of storing `replacedById`.
   */
  async rotateRefreshToken(
    token: string,
    context: { userAgent?: string; ip?: string },
  ): Promise<{ employeeId: bigint; refreshToken: string }> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.jwt.refreshSecret,
      });
      if (payload.typ !== 'refresh') throw new Error('wrong token type');
    } catch {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });

    if (!stored || stored.tokenHash !== this.hash(token)) {
      await this.revokeFamily(payload.fam);
      throw new UnauthorizedException('Your session is no longer valid. Please sign in again.');
    }

    if (stored.revokedAt !== null || stored.replacedById !== null) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException(
        'This session was already refreshed elsewhere. For your security, please sign in again.',
      );
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    const next = await this.issueRefreshToken(stored.employeeId, {
      ...context,
      familyId: stored.familyId,
    });

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: next.jti },
    });

    return { employeeId: stored.employeeId, refreshToken: next.token };
  }

  async revokeToken(token: string): Promise<void> {
    try {
      const payload = this.jwt.decode(token) as RefreshTokenPayload | null;
      if (!payload?.jti) return;
      await this.prisma.refreshToken.updateMany({
        where: { id: payload.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // A malformed token on logout is not worth failing the request over.
    }
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForEmployee(employeeId: bigint): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { employeeId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Housekeeping: drop tokens that expired more than a week ago. */
  async pruneExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - 7 * 86_400_000);
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    return result.count;
  }
}
