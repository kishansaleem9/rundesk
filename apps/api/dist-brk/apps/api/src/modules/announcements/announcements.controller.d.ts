import { AnnouncementsService } from './announcements.service';
export declare class AnnouncementsController {
    private readonly announcementsService;
    constructor(announcementsService: AnnouncementsService);
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
    listActive(workspaceId: string, user: {
        id: string;
    }): Promise<{
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
    create(workspaceId: string, user: {
        id: string;
    }, body: {
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
    update(workspaceId: string, announcementId: string, body: Partial<{
        title: string;
        body: string;
        tone: 'info' | 'celebrate' | 'warn';
        isActive: boolean;
        expiresAt: string | null;
    }>, user: {
        id: string;
    }): Promise<{
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
    remove(workspaceId: string, announcementId: string, user: {
        id: string;
    }): Promise<{
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
    dismiss(workspaceId: string, announcementId: string, user: {
        id: string;
    }): Promise<{
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
