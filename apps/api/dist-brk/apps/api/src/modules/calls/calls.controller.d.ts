import { CallsService } from './calls.service';
import type { CurrentUserPayload } from '../tasks/types';
/**
 * §2.8 SyncUp — the call's lifecycle.
 *
 * Signalling does NOT go through here: offers, answers and ICE candidates are
 * relayed by the realtime gateway, because they are per-peer and constant.
 * This is the part that has to be true for everyone — who is in, and whether
 * it is being recorded.
 */
export declare class CallsController {
    private svc;
    constructor(svc: CallsService);
    live(_workspaceId: string, channelId: string, user: CurrentUserPayload): Promise<{
        participants: {
            userId: string;
            joinedAt: Date;
            leftAt: Date | null;
            wasRecorded: boolean;
            name: string;
            email: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        channelId: string | null;
        startedById: string;
        title: string | null;
        startedAt: Date;
        endedAt: Date | null;
        recording: boolean;
        recordingStartedAt: Date | null;
        meetingId: string | null;
        recordingStorageKey: string | null;
        createdAt: Date;
    } | null> | null;
    start(workspaceId: string, user: CurrentUserPayload, body: {
        channelId?: string;
        title?: string;
    }): Promise<{
        participants: {
            userId: string;
            joinedAt: Date;
            leftAt: Date | null;
            wasRecorded: boolean;
            name: string;
            email: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        channelId: string | null;
        startedById: string;
        title: string | null;
        startedAt: Date;
        endedAt: Date | null;
        recording: boolean;
        recordingStartedAt: Date | null;
        meetingId: string | null;
        recordingStorageKey: string | null;
        createdAt: Date;
    }>;
    join(callId: string, user: CurrentUserPayload): Promise<{
        participants: {
            userId: string;
            joinedAt: Date;
            leftAt: Date | null;
            wasRecorded: boolean;
            name: string;
            email: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        channelId: string | null;
        startedById: string;
        title: string | null;
        startedAt: Date;
        endedAt: Date | null;
        recording: boolean;
        recordingStartedAt: Date | null;
        meetingId: string | null;
        recordingStorageKey: string | null;
        createdAt: Date;
    }>;
    leave(callId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
        meetingId: string | null;
        pending: boolean;
    } | {
        ok: boolean;
        remaining: number;
    }>;
    end(callId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
        meetingId: string | null;
        pending: boolean;
    }>;
    recording(callId: string, user: CurrentUserPayload, body: {
        recording?: boolean;
    }): Promise<{
        ok: boolean;
        recording: boolean;
    }>;
    /**
     * §2.8 gap 10 — the transcript, as it is being said.
     *
     * Over HTTP rather than the socket, unlike signalling: a line of speech is
     * something that must be KEPT, and a fire-and-forget socket emit gives the
     * client no way to know whether it landed. It is also the surface that
     * refuses to record while the banner is down, which is not a decision to make
     * on a channel with no reply.
     */
    transcript(callId: string, user: CurrentUserPayload, body: {
        text?: string;
        replacesPrevious?: boolean;
    }): Promise<{
        ok: false;
        reason: "ended";
    } | {
        ok: false;
        reason: "not_recording";
    } | {
        ok: false;
        reason: "empty";
    } | {
        ok: true;
        reason?: undefined;
    }>;
    readTranscript(callId: string, user: CurrentUserPayload): Promise<{
        transcript: string;
    }>;
    recordingUploadUrl(callId: string, user: CurrentUserPayload, body: {
        contentType?: string;
    }): Promise<{
        uploadUrl: string;
        storageKey: string;
    }>;
    attachRecording(callId: string, user: CurrentUserPayload, body: {
        storageKey?: string;
    }): Promise<{
        ok: boolean;
    }>;
}
