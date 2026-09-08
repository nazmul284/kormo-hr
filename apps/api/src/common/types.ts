/** The authenticated principal, resolved fresh from the DB on every request. */
export interface SessionPrincipal {
  id: bigint;
  employeeVisibleId: string;
  username: string;
  companyId: number;
  departmentId: number | null;
  locationId: number | null;
  isLineManager: boolean;
  isHeadOfDepartment: boolean;
  roles: string[];
  permissions: Set<string>;
  accessibleCompanyIds: number[];
  features: Record<string, boolean>;
}

export type ScopeLevel = 'self' | 'team' | 'all';
