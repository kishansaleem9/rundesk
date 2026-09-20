import type { Db } from '@rundesk/db';
import { R2Service } from '../../common/storage/r2.service';
import { EmailService } from '../email/email.service';
export declare class ClipsService {
    private readonly r2;
    private readonly email;
    private readonly db;
    constructor(r2: R2Service, email: EmailService, db: Db);
    private sanitizeFileName;
    private clipPrefix;
    createUploadUrl(workspaceId: string, actorEmail: string, body: {
        fileName: string;
        contentType: string;
        durationSeconds?: number;
        title?: string;
    }): Promise<{
        uploadUrl: string;
        storageKey: string;
    }>;
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
    remove(workspaceId: string, storageKey: string): Promise<{
        ok: boolean;
    }>;
    share(workspaceId: string, actorId: string, actorEmail: string, body: {
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
