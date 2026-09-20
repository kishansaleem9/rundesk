import type { Db } from '@rundesk/db';
import { RealtimeGateway } from '../realtime/realtime.gateway';
export declare class CanvasesService {
    private readonly db;
    private readonly realtime;
    constructor(db: Db, realtime: RealtimeGateway);
    list(workspaceId: string, type?: string): Promise<{
        id: string;
        workspaceId: string;
        type: string;
        title: string;
        data: unknown;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    create(workspaceId: string, userId: string, body: {
        type: string;
        title: string;
        data?: unknown;
    }): Promise<{
        id: string;
        data: unknown;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        createdById: string | null;
        title: string;
        type: string;
    }>;
    get(workspaceId: string, canvasId: string): Promise<{
        id: string;
        workspaceId: string;
        type: string;
        title: string;
        data: unknown;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(workspaceId: string, canvasId: string, actorId: string, body: {
        title?: string;
        data?: unknown;
        type?: string;
        expectedUpdatedAt?: string;
    }): Promise<{
        id: string;
        workspaceId: string;
        type: string;
        title: string;
        data: unknown;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(workspaceId: string, canvasId: string, actorId: string): Promise<{
        ok: boolean;
    }>;
    private isSupportedType;
}
