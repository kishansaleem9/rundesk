export declare class InviteItemDto {
    email: string;
    orgRole?: 'admin' | 'member';
    workspaceRole?: 'workspace_admin' | 'manager' | 'member' | 'guest';
}
export declare class SignupDto {
    fullName: string;
    email: string;
    password: string;
    organizationName: string;
    organizationSlug?: string;
    features?: string[];
    invites?: InviteItemDto[];
}
