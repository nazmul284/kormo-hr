import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { SessionPrincipal } from '../types';

export const IS_PUBLIC_KEY = 'kormo:isPublic';
export const PERMISSIONS_KEY = 'kormo:permissions';
export const PERMISSIONS_MODE_KEY = 'kormo:permissionsMode';
export const FEATURE_KEY = 'kormo:feature';
export const AUDIT_KEY = 'kormo:audit';

/** Skips authentication entirely (login, refresh, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Requires permissions. Default mode is `any` — holding one of the listed
 * keys is enough, which suits routes reachable by several roles.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Switches the guard to requiring *all* listed permissions. */
export const RequireAllPermissions = (...permissions: string[]) => {
  const decorate = (target: any, key?: any, descriptor?: any) => {
    SetMetadata(PERMISSIONS_KEY, permissions)(target, key, descriptor);
    SetMetadata(PERMISSIONS_MODE_KEY, 'all')(target, key, descriptor);
  };
  return decorate as MethodDecorator & ClassDecorator;
};

/** Requires a tenant feature flag to be switched on. */
export const RequireFeature = (flag: string) => SetMetadata(FEATURE_KEY, flag);

/** Records the call in the audit trail. */
export const Audit = (action: string, entityType: string) =>
  SetMetadata(AUDIT_KEY, { action, entityType });

/** Injects the authenticated principal. */
export const CurrentUser = createParamDecorator(
  (field: keyof SessionPrincipal | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as SessionPrincipal | undefined;
    return field ? user?.[field] : user;
  },
);
