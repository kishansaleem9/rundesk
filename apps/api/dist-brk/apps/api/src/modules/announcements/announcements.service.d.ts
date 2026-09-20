import type { Db } from '@rundesk/db';
import { SecurityService } from '../security/security.service';
export declare class AnnouncementsService {
    private db;
    private readonly security;
    constructor(db: Db, security: SecurityService);
    list(workspaceId: string): Promise<{
        id: string;
        workspaceId: string;
        createdById: string | null;
        title: string;
        body: string;
        tone: string;
        isActive: boolean;
        expiresAt: Date | null;
        views: number;
        dismisses: number;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    listActive(workspaceId: string, userId: string): Promise<{
        id: string;
        workspaceId: string;
        createdById: string | null;
        title: string;
        body: string;
        tone: string;
        isActive: boolean;
        expiresAt: Date | null;
        views: number;
        dismisses: number;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    create(workspaceId: string, userId: string, input: {
        title: string;
        body?: string;
        tone?: 'info' | 'celebrate' | 'warn';
        expiresAt?: string | null;
        isActive?: boolean;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        isActive: boolean;
        createdById: string | null;
        title: string;
        expiresAt: Date | null;
        body: string;
        tone: string;
        views: number;
        dismisses: number;
    }>;
    update(workspaceId: string, announcementId: string, patch: Partial<{
        title: string;
        body: string;
        tone: 'info' | 'celebrate' | 'warn';
        isActive: boolean;
        expiresAt: string | null;
    }>, actorId?: string): Promise<{
        id: string;
        workspaceId: string;
        createdById: string | null;
        title: string;
        body: string;
        tone: string;
        isActive: boolean;
        expiresAt: Date | null;
        views: number;
        dismisses: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(workspaceId: string, announcementId: string, actorId?: string): Promise<{
        ok: boolean;
    }>;
    trackView(workspaceId: string, announcementId: string): Promise<{
        id: string;
        workspaceId: string;
        createdById: string | null;
        title: string;
        body: string;
        tone: string;
        isActive: boolean;
        expiresAt: Date | null;
        views: number;
        dismisses: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    dismiss(workspaceId: string, announcementId: string, userId: string): Promise<{
        id: string;
        workspaceId: string;
        createdById: string | null;
        title: string;
        body: string;
        tone: string;
        isActive: boolean;
        expiresAt: Date | null;
        views: number;
        dismisses: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
