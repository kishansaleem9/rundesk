import { CanvasesService } from './canvases.service';
export declare class CanvasesController {
    private readonly svc;
    constructor(svc: CanvasesService);
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
    create(workspaceId: string, user: any, body: {
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
    update(workspaceId: string, canvasId: string, user: any, body: {
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
    remove(workspaceId: string, canvasId: string, user: any): Promise<{
        ok: boolean;
    }>;
}
