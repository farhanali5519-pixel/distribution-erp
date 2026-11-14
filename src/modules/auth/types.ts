import { UserPermissionsMap } from './permissions-registry';

export type UserRole = 'ADMIN' | 'SALESMAN' | 'CASHIER' | 'WAREHOUSE' | 'ORDER_BOOKER';

export interface AppUser {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  staff_id: string | null;
  staff_name?: string | null;
  is_active: number;
  permissions_json?: string | null;
  permissions?: UserPermissionsMap;
  created_at: string;
  updated_at: string;
  company_id?: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
  staffId?: string | null;
}

export interface UpdateUserInput {
  fullName?: string;
  role?: UserRole;
  password?: string;
  staffId?: string | null;
  isActive?: boolean;
  permissions?: UserPermissionsMap;
}

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  staffId: string | null;
  staffName?: string | null;
  permissions?: UserPermissionsMap;
  company_id?: string;
}

