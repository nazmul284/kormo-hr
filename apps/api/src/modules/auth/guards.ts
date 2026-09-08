import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  FEATURE_KEY, IS_PUBLIC_KEY, PERMISSIONS_KEY, PERMISSIONS_MODE_KEY,
} from '../../common/decorators';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

export const ACCESS_COOKIE = 'kormo_at';
export const REFRESH_COOKIE = 'kormo_rt';

/**
 * Authenticates from the httpOnly access cookie, falling back to a
 * bearer header for API clients and integration tests.
 *
 * Cookies, not localStorage: a stored token is exfiltratable by any XSS,
 * and the system being replaced kept its bearer token in `localStorage`
 * exactly that way.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const request = ctx.switchToHttp().getRequest();
    const token = extractToken(request);
    if (!token) throw new UnauthorizedException('You are not signed in.');

    const payload = await this.tokens.verifyAccessToken(token);
    request.user = await this.sessions.loadPrincipal(BigInt(payload.sub));
    return true;
  }
}

export function extractToken(request: {
  cookies?: Record<string, string>;
  headers: Record<string, unknown>;
}): string | null {
  const cookie = request.cookies?.[ACCESS_COOKIE];
  if (cookie) return cookie;

  const header = request.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim() || null;
  }
  return null;
}

/** Enforces the permission keys declared by @RequirePermissions(). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new UnauthorizedException('You are not signed in.');

    const mode = this.reflector.getAllAndOverride<string>(PERMISSIONS_MODE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    const granted =
      mode === 'all'
        ? required.every((permission) => user.permissions.has(permission))
        : required.some((permission) => user.permissions.has(permission));

    if (!granted) {
      throw new ForbiddenException(
        `You do not have permission to do this (requires ${required.join(mode === 'all' ? ' and ' : ' or ')}).`,
      );
    }
    return true;
  }
}

/** Blocks routes whose tenant feature flag is switched off. */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const flag = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!flag) return true;

    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new UnauthorizedException('You are not signed in.');

    if (user.features[flag] !== true) {
      throw new ForbiddenException('This module is not enabled for your organisation.');
    }
    return true;
  }
}
