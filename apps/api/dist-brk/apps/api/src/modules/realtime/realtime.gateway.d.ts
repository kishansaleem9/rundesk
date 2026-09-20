import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Db } from '@rundesk/db';
import { PresenceService } from '../presence/presence.service';
/**
 * Room taxonomy:
 *   workspace:{workspaceId}         - workspace-wide events (notifications, members)
 *   list:{listId}                   - list-level events (task.created, task.updated, task.deleted)
 *   task:{taskId}                   - task-detail events (comments, activity, checklist, watchers)
 *   doc:{docId}                     - per-doc updates (presence, content patches)
 *   canvas:{canvasId}               - per-canvas presence + collaborator cursors
 *   user:{userId}                   - private user channel (notifications, cross-tab sync)
 */
export type RoomKey = `workspace:${string}` | `list:${string}` | `task:${string}` | `doc:${string}` | `canvas:${string}` | `user:${string}`;
export type RealtimeEvent = {
    type: 'task.created';
    listId: string;
    task: unknown;
} | {
    type: 'task.updated';
    listId: string;
    taskId: string;
    patch: Record<string, unknown>;
} | {
    type: 'task.deleted';
    listId: string;
    taskId: string;
} | {
    type: 'task.moved';
    listId: string;
    taskId: string;
    toListId: string;
} | {
    type: 'comment.created';
    taskId: string;
    comment: unknown;
} | {
    type: 'comment.updated';
    taskId: string;
    commentId: string;
    patch: Record<string, unknown>;
} | {
    type: 'comment.deleted';
    taskId: string;
    commentId: string;
} | {
    type: 'activity.created';
    taskId: string;
    activity: unknown;
} | {
    type: 'checklist.updated';
    taskId: string;
} | {
    type: 'watchers.updated';
    taskId: string;
} | {
    type: 'doc.updated';
    docId: string;
    patch: Record<string, unknown>;
} | {
    type: 'doc.comment.created';
    docId: string;
    commentId: string;
    parentCommentId: string | null;
} | {
    type: 'doc.comment.updated';
    docId: string;
    commentId: string;
} | {
    type: 'doc.comment.resolution_changed';
    docId: string;
    commentId: string;
    isResolved: boolean;
} | {
    type: 'doc.comment.removed';
    docId: string;
    commentId: string;
} | {
    type: 'presence.join';
    room: RoomKey;
    user: {
        id: string;
        displayName: string;
    };
} | {
    type: 'presence.leave';
    room: RoomKey;
    userId: string;
} | {
    type: 'notification.created';
    userId: string;
    notification: unknown;
} | {
    type: 'chat.channel.created';
    workspaceId: string;
    channel: unknown;
} | {
    type: 'chat.channel.members.added';
    workspaceId: string;
    channelId: string;
} | {
    type: 'chat.channel.members.updated';
    workspaceId: string;
    channelId: string;
} | {
    type: 'chat.message.created';
    workspaceId: string;
    channelId: string;
    message: unknown;
} | {
    type: 'chat.message.updated';
    workspaceId: string;
    channelId: string;
    messageId: string;
    patch: Record<string, unknown>;
} | {
    type: 'chat.message.deleted';
    workspaceId: string;
    channelId: string;
    messageId: string;
} | {
    type: 'chat.message.assigned';
    workspaceId: string;
    channelId: string;
    messageId: string;
} | {
    type: 'chat.reaction.toggled';
    workspaceId: string;
    channelId: string;
    messageId: string;
} | {
    type: 'canvas.created';
    workspaceId: string;
    canvas: unknown;
    actorId?: string;
} | {
    type: 'canvas.updated';
    workspaceId: string;
    canvasId: string;
    patch: Record<string, unknown>;
    actorId?: string;
} | {
    type: 'canvas.deleted';
    workspaceId: string;
    canvasId: string;
    actorId?: string;
} | {
    type: 'canvas.cursor';
    canvasId: string;
    userId: string;
    displayName: string;
    x: number;
    y: number;
    color?: string;
} | {
    type: 'canvas.cursor.leave';
    canvasId: string;
    userId: string;
};
export declare class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly jwtService;
    private readonly config;
    private readonly db;
    private readonly presence;
    private readonly logger;
    server: Server;
    constructor(jwtService: JwtService, config: ConfigService, db: Db, presence: PresenceService);
    /** Resolve the owning workspace for a room key, or null if it can't be resolved. */
    private resolveWorkspaceForRoom;
    /** A socket may only join a room it is authorized for (own user channel, or a
     *  workspace it belongs to — resolved transitively for list/task/doc/canvas). */
    private canJoinRoom;
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): void;
    /** Keep-alive heartbeat from the client (~every 60s) so presence stays fresh. */
    handlePresencePing(client: Socket): void;
    handleSubscribe(client: Socket, body: {
        rooms: RoomKey[];
    }): Promise<{
        ok: boolean;
        error: string;
        joined?: undefined;
        denied?: undefined;
    } | {
        ok: boolean;
        joined: string[];
        denied: string[];
        error?: undefined;
    }>;
    handleUnsubscribe(client: Socket, body: {
        rooms: RoomKey[];
    }): {
        ok: boolean;
        error: string;
        left?: undefined;
    } | {
        ok: boolean;
        left: RoomKey[];
        error?: undefined;
    };
    /**
     * Collaborator cursor broadcast for whiteboards / mind maps. Receives a
     * raw {canvasId, x, y} payload from the client, stamps it with the
     * connection's authenticated identity, and fans out to all other sockets
     * in the canvas room. Sender is excluded so a client never sees its own
     * cursor reflected back.
     */
    handleCanvasCursor(client: Socket, body: {
        canvasId?: string;
        x?: number;
        y?: number;
        color?: string;
        displayName?: string;
    }): {
        ok: boolean;
    };
    handleCanvasCursorLeave(client: Socket, body: {
        canvasId?: string;
    }): {
        ok: boolean;
    };
    /**
     * §2.8 SyncUp — WebRTC signalling relay.
     *
     * Offers, answers and ICE candidates go peer-to-peer once the handshake is
     * done; until then they need a courier, and this is it. The server reads
     * nothing but the address: `to` is the peer, and the payload is opaque.
     *
     * The SENDER's identity comes from the socket, never from the body. A client
     * that could name its own `from` could impersonate a colleague in a call —
     * offering a stream that appears to come from someone else — and nothing
     * downstream would question it.
     */
    handleCallSignal(client: Socket, body: {
        callId?: string;
        to?: string;
        signal?: unknown;
    }): {
        ok: boolean;
    };
    /**
     * §2.8 — an in-call reaction, `[20:47]`: "Agar main koi reaction doongi to
     * woh yahan pe show ho jaata hai."
     *
     * Not persisted anywhere. A reaction is a thing that happens and then is
     * over; writing it down would leave a channel full of thumbs-ups nobody
     * meant to keep.
     */
    handleCallReaction(client: Socket, body: {
        callId?: string;
        workspaceId?: string;
        emoji?: string;
    }): {
        ok: boolean;
    };
    emitToRoom(room: RoomKey, event: RealtimeEvent): void;
    emitToUser(userId: string, event: RealtimeEvent): void;
    emitToList(listId: string, event: RealtimeEvent): void;
    emitToTask(taskId: string, event: RealtimeEvent): void;
    emitToWorkspace(workspaceId: string, event: RealtimeEvent): void;
    emitToDoc(docId: string, event: RealtimeEvent): void;
}
