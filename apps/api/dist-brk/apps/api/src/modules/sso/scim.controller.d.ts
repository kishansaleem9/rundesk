import { ScimService } from './scim.service';
type CurrentUserPayload = {
    id: string;
    email: string;
};
export declare class ScimAdminController {
    private scim;
    constructor(scim: ScimService);
    list(workspaceId: string): Promise<{
        id: string;
        name: string;
        keyPrefix: string;
        createdById: string | null;
        lastUsedAt: Date | null;
        expiresAt: Date | null;
        revokedAt: Date | null;
        createdAt: Date;
    }[]>;
    create(workspaceId: string, body: {
        name: string;
        expiresAt?: string;
    }, user: CurrentUserPayload): Promise<{
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
    revoke(workspaceId: string, tokenId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
}
export declare class ScimController {
    private scim;
    constructor(scim: ScimService);
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
    listUsers(authHeader: string | undefined, startIndex?: string, count?: string, filter?: string): Promise<{
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
    getUser(authHeader: string | undefined, id: string): Promise<{
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
    createUser(authHeader: string | undefined, body: any, res: any): Promise<{
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
    replaceUser(authHeader: string | undefined, id: string, body: any): Promise<{
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
    patchUser(authHeader: string | undefined, id: string, body: any): Promise<{
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
    deleteUser(authHeader: string | undefined, id: string, res: any): Promise<void>;
    listGroups(authHeader: string | undefined, startIndex?: string, count?: string, filter?: string): Promise<{
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
    getGroup(authHeader: string | undefined, id: string): Promise<{
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
    createGroup(authHeader: string | undefined, body: any, res: any): Promise<{
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
    replaceGroup(authHeader: string | undefined, id: string, body: any): Promise<{
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
    patchGroup(authHeader: string | undefined, id: string, body: any): Promise<{
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
    deleteGroup(authHeader: string | undefined, id: string, res: any): Promise<void>;
    private extractBearer;
}
export {};
