import { SharesService } from './shares.service';
/**
 * Share & Permissions for every object type — space, folder, project, list,
 * task and doc all use the same routes, so one panel in the UI serves them all.
 * Membership/permission checks live in the service (a guest may never share).
 */
export declare class SharesController {
    private shares;
    constructor(shares: SharesService);
    list(objectType: string, objectId: string, user: any): Promise<{
        items: import("./shares.service").ShareRow[];
        myLevel: "admin" | "edit" | "comment" | "view" | null;
        canShare: boolean;
        levels: readonly ["view", "comment", "edit", "admin"];
        types: readonly ["space", "folder", "project", "list", "task", "doc", "channel", "dashboard", "view"];
    }>;
    share(objectType: string, objectId: string, user: any, ip: string, body: {
        userId?: string;
        email?: string;
        level?: string;
    }): Promise<{
        ok: boolean;
        updated: boolean;
        id?: undefined;
    } | {
        ok: boolean;
        id: string;
        updated?: undefined;
    }>;
    updateLevel(objectType: string, objectId: string, shareId: string, user: any, ip: string, body: {
        level: string;
    }): Promise<{
        ok: boolean;
    }>;
    /**
     * §G10 [12:16–12:20] — ask the people who can grant it.
     *
     * Deliberately NOT under the permission check the other routes share: the
     * whole point is that the caller cannot see this object. It needs only a
     * workspace membership, which the service establishes by looking the object
     * up inside `workspaceId`.
     */
    request(objectType: string, objectId: string, body: {
        workspaceId: string;
    }, user: any): Promise<{
        status: "sent" | "already_asked" | "no_owners";
        notified: number;
    }>;
    revoke(objectType: string, objectId: string, shareId: string, user: any, ip: string): Promise<{
        ok: boolean;
    }>;
}
