import { SetMetadata } from '@nestjs/common'

export type Role = 'super_admin' | 'workspace_admin' | 'manager' | 'member' | 'guest'
export const ROLES_KEY = 'roles'
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles)
