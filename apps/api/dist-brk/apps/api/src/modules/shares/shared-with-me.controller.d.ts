import { SharesService } from './shares.service';
import type { CurrentUserPayload } from '../tasks/types';
/**
 * A1.7 — the reverse of `SharesController`, which is keyed by an object you
 * already know. Workspace-scoped rather than share-scoped so it sits next to
 * the other `workspaces/:workspaceId/...` reads, and so the sidebar, the search
 * palette (A2.10) and the Docs hub (A5.6) can all call the same route.
 */
export declare class SharedWithMeController {
    private shares;
    constructor(shares: SharesService);
    list(workspaceId: string, user: CurrentUserPayload): Promise<import("./shares.service").SharedWithMeItem[]>;
}
