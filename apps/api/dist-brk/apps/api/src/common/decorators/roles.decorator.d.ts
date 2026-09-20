export type Role = 'super_admin' | 'workspace_admin' | 'manager' | 'member' | 'guest';
export declare const ROLES_KEY = "roles";
export declare const Roles: (...roles: Role[]) => import("@nestjs/common").CustomDecorator<string>;
