import type { Db } from '@rundesk/db';
import { SecurityService } from '../security/security.service';
import { WorkspaceGroupsService } from '../workspace-groups/workspace-groups.service';
type ScimNameInput = {
    givenName?: string;
    familyName?: string;
    formatted?: string;
};
type ScimEmailInput = {
    value?: string;
    primary?: boolean;
};
type ScimUserInput = {
    userName?: string;
    displayName?: string;
    active?: boolean;
    emails?: ScimEmailInput[];
    name?: ScimNameInput;
};
type ScimPatchOp = {
    op: 'add' | 'replace' | 'Add' | 'Replace' | 'remove' | 'Remove';
    path?: string;
    value?: unknown;
};
export declare class ScimService {
    private db;
    private security;
    private groups;
    constructor(db: Db, security: SecurityService, groups: WorkspaceGroupsService);
    listTokens(workspaceId: string): Promise<{
        id: string;
        name: string;
        keyPrefix: string;
        createdById: string | null;
        lastUsedAt: Date | null;
        expiresAt: Date | null;
        revokedAt: Date | null;
        createdAt: Date;
    }[]>;
    createToken(workspaceId: string, actorId: string, input: {
        name: string;
        expiresAt?: Date | null;
    }): Promise<{
        tokenHash: undefined;
        token: string;
        id: string;
        name: string;
        createdAt: Date;
        workspaceId: string;
        createdById: string | null;
        expiresAt: Date | null;
        keyPrefix: string;
        lastUsedAt: Date | null;
        revokedAt: Date | null;
    }>;
    revokeToken(workspaceId: string, tokenId: string, actorId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * Validate a bearer token from the Authorization header and return the
     * workspace it grants access to. Updates lastUsedAt on each successful
     * validation.
     */
    authenticate(rawToken: string | undefined): Promise<string>;
    /**
     * Map a workspace member row to a SCIM 2.0 Users resource representation.
     */
    private toScimUser;
    listUsers(workspaceId: string, opts?: {
        startIndex?: number;
        count?: number;
        filter?: string;
    }): Promise<{
        schemas: string[];
        totalResults: number;
        startIndex: number;
        itemsPerPage: number;
        Resources: {
            schemas: string[];
            id: string;
            userName: string;
            displayName: string;
            active: boolean;
            name: {
                givenName: string;
                familyName: string;
                formatted: string;
            };
            emails: {
                value: string;
                primary: boolean;
                type: string;
            }[];
            meta: {
                resourceType: string;
                created: string;
                lastModified: string;
                location: string;
            };
        }[];
    }>;
    getUser(workspaceId: string, userId: string): Promise<{
        schemas: string[];
        id: string;
        userName: string;
        displayName: string;
        active: boolean;
        name: {
            givenName: string;
            familyName: string;
            formatted: string;
        };
        emails: {
            value: string;
            primary: boolean;
            type: string;
        }[];
        meta: {
            resourceType: string;
            created: string;
            lastModified: string;
            location: string;
        };
    }>;
    createUser(workspaceId: string, actorId: string | null, input: ScimUserInput): Promise<{
        schemas: string[];
        id: string;
        userName: string;
        displayName: string;
        active: boolean;
        name: {
            givenName: string;
            familyName: string;
            formatted: string;
        };
        emails: {
            value: string;
            primary: boolean;
            type: string;
        }[];
        meta: {
            resourceType: string;
            created: string;
            lastModified: string;
            location: string;
        };
    }>;
    replaceUser(workspaceId: string, userId: string, actorId: string | null, input: ScimUserInput): Promise<{
        schemas: string[];
        id: string;
        userName: string;
        displayName: string;
        active: boolean;
        name: {
            givenName: string;
            familyName: string;
            formatted: string;
        };
        emails: {
            value: string;
            primary: boolean;
            type: string;
        }[];
        meta: {
            resourceType: string;
            created: string;
            lastModified: string;
            location: string;
        };
    }>;
    patchUser(workspaceId: string, userId: string, actorId: string | null, patch: {
        Operations?: ScimPatchOp[];
    }): Promise<{
        schemas: string[];
        id: string;
        userName: string;
        displayName: string;
        active: boolean;
        name: {
            givenName: string;
            familyName: string;
            formatted: string;
        };
        emails: {
            value: string;
            primary: boolean;
            type: string;
        }[];
        meta: {
            resourceType: string;
            created: string;
            lastModified: string;
            location: string;
        };
    }>;
    deleteUser(workspaceId: string, userId: string, actorId: string | null): Promise<{
        ok: boolean;
    }>;
    serviceProviderConfig(): {
        schemas: string[];
        patch: {
            supported: boolean;
        };
        bulk: {
            supported: boolean;
            maxOperations: number;
            maxPayloadSize: number;
        };
        filter: {
            supported: boolean;
            maxResults: number;
        };
        changePassword: {
            supported: boolean;
        };
        sort: {
            supported: boolean;
        };
        etag: {
            supported: boolean;
        };
        authenticationSchemes: {
            type: string;
            name: string;
            description: string;
        }[];
    };
    schemas(): {
        schemas: string[];
        totalResults: number;
        Resources: ({
            id: string;
            name: string;
            description: string;
            attributes: ({
                name: string;
                type: string;
                required: boolean;
                mutability: string;
                uniqueness: string;
            } | {
                name: string;
                type: string;
                required: boolean;
                mutability: string;
                uniqueness?: undefined;
            })[];
        } | {
            id: string;
            name: string;
            description: string;
            attributes: ({
                name: string;
                type: string;
                required: boolean;
                mutability: string;
                multiValued?: undefined;
            } | {
                name: string;
                type: string;
                multiValued: boolean;
                mutability: string;
                required?: undefined;
            })[];
        })[];
    };
    resourceTypes(): {
        schemas: string[];
        totalResults: number;
        Resources: {
            schemas: string[];
            id: string;
            name: string;
            endpoint: string;
            schema: string;
        }[];
    };
    private toScimGroup;
    listGroups(workspaceId: string, opts?: {
        startIndex?: number;
        count?: number;
        filter?: string;
    }): Promise<{
        schemas: string[];
        totalResults: number;
        startIndex: number;
        itemsPerPage: number;
        Resources: {
            schemas: string[];
            id: string;
            externalId: string | undefined;
            displayName: string;
            members: {
                value: string;
                display: string;
                $ref: string;
                type: string;
            }[];
            meta: {
                resourceType: string;
                created: string;
                lastModified: string;
                location: string;
            };
        }[];
    }>;
    getGroup(workspaceId: string, groupId: string): Promise<{
        schemas: string[];
        id: string;
        externalId: string | undefined;
        displayName: string;
        members: {
            value: string;
            display: string;
            $ref: string;
            type: string;
        }[];
        meta: {
            resourceType: string;
            created: string;
            lastModified: string;
            location: string;
        };
    }>;
    createGroup(workspaceId: string, actorId: string | null, body: {
        displayName?: string;
        externalId?: string | null;
        members?: Array<{
            value?: string;
        }>;
    }): Promise<{
        schemas: string[];
        id: string;
        externalId: string | undefined;
        displayName: string;
        members: {
            value: string;
            display: string;
            $ref: string;
            type: string;
        }[];
        meta: {
            resourceType: string;
            created: string;
            lastModified: string;
            location: string;
        };
    }>;
    replaceGroup(workspaceId: string, groupId: string, actorId: string | null, body: {
        displayName?: string;
        externalId?: string | null;
        members?: Array<{
            value?: string;
        }>;
    }): Promise<{
        schemas: string[];
        id: string;
        externalId: string | undefined;
        displayName: string;
        members: {
            value: string;
            display: string;
            $ref: string;
            type: string;
        }[];
        meta: {
            resourceType: string;
            created: string;
            lastModified: string;
            location: string;
        };
    }>;
    patchGroup(workspaceId: string, groupId: string, actorId: string | null, patch: {
        Operations?: ScimPatchOp[];
    }): Promise<{
        schemas: string[];
        id: string;
        externalId: string | undefined;
        displayName: string;
        members: {
            value: string;
            display: string;
            $ref: string;
            type: string;
        }[];
        meta: {
            resourceType: string;
            created: string;
            lastModified: string;
            location: string;
        };
    }>;
    deleteGroup(workspaceId: string, groupId: string, actorId: string | null): Promise<{
        ok: boolean;
    }>;
    private hash;
}
export {};
