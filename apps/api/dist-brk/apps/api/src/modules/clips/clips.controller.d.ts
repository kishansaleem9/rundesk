import { ClipsService } from './clips.service';
export declare class ClipsController {
    private readonly clips;
    constructor(clips: ClipsService);
    list(workspaceId: string): Promise<{
        id: string;
        storageKey: string;
        title: string;
        fileName: string;
        durationSeconds: number;
        recordedBy: string;
        sizeBytes: number;
        createdAt: string | null;
        url: string;
    }[]>;
    presign(workspaceId: string, user: {
        email: string;
    }, body: {
        fileName: string;
        contentType: string;
        durationSeconds?: number;
        title?: string;
    }): Promise<{
        uploadUrl: string;
        storageKey: string;
    }>;
    remove(workspaceId: string, body: {
        storageKey: string;
    }): Promise<{
        ok: boolean;
    }>;
    share(workspaceId: string, user: {
        id: string;
        email: string;
        role?: string;
    }, body: {
        storageKey: string;
        mode: 'member' | 'external' | 'public';
        userId?: string;
        email?: string;
        expiresInMinutes?: number;
    }): Promise<{
        shareUrl: string;
        sentTo?: undefined;
    } | {
        shareUrl: string;
        sentTo: string;
    }>;
}
