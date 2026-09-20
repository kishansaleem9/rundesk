import { AiService } from './ai.service';
import { KnowledgeIndexerService } from './knowledge-indexer.service';
/**
 * §15.1 admin backfill for the semantic Knowledge Base (trigger a). Kept on its
 * own controller so the route matches the spec — POST /workspaces/:id/knowledge/reindex
 * — while living entirely inside the AI module. Manager/admin only; the AI
 * question endpoint stays on AiController.
 */
export declare class KnowledgeController {
    private readonly ai;
    private readonly indexer;
    constructor(ai: AiService, indexer: KnowledgeIndexerService);
    reindex(user: any, workspaceId: string): Promise<import("./knowledge-indexer.service").IndexResult>;
}
