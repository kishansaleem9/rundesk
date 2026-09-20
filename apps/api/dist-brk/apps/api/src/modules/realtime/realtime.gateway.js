"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const presence_service_1 = require("../presence/presence.service");
const auth_cookies_1 = require("../auth/auth-cookies");
/**
 * Extract the access_token from a raw Cookie header. Browser sessions no longer
 * keep the JWT in JS (it lives in an httpOnly cookie), so the socket handshake
 * can't pass it via `auth.token`; the cookie rides along automatically instead.
 */
function accessTokenFromCookieHeader(cookieHeader) {
    if (!cookieHeader)
        return undefined;
    for (const part of cookieHeader.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0)
            continue;
        if (part.slice(0, eq).trim() === auth_cookies_1.ACCESS_TOKEN_COOKIE) {
            return decodeURIComponent(part.slice(eq + 1).trim());
        }
    }
    return undefined;
}
let RealtimeGateway = class RealtimeGateway {
    constructor(jwtService, config, db, presence) {
        this.jwtService = jwtService;
        this.config = config;
        this.db = db;
        this.presence = presence;
        this.logger = new common_1.Logger('RealtimeGateway');
    }
    /** Resolve the owning workspace for a room key, or null if it can't be resolved. */
    async resolveWorkspaceForRoom(kind, id) {
        if (kind === 'workspace')
            return id;
        if (kind === 'doc') {
            const [d] = await this.db.select({ w: db_1.docs.workspaceId }).from(db_1.docs).where((0, drizzle_orm_1.eq)(db_1.docs.id, id)).limit(1);
            return d?.w ?? null;
        }
        if (kind === 'canvas') {
            const [c] = await this.db.select({ w: db_1.workspaceCanvases.workspaceId }).from(db_1.workspaceCanvases).where((0, drizzle_orm_1.eq)(db_1.workspaceCanvases.id, id)).limit(1);
            return c?.w ?? null;
        }
        if (kind === 'list') {
            const [r] = await this.db
                .select({ w: db_1.spaces.workspaceId })
                .from(db_1.lists)
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.eq)(db_1.lists.id, id))
                .limit(1);
            return r?.w ?? null;
        }
        if (kind === 'task') {
            const [r] = await this.db
                .select({ w: db_1.spaces.workspaceId })
                .from(db_1.tasks)
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.eq)(db_1.tasks.id, id))
                .limit(1);
            return r?.w ?? null;
        }
        return null;
    }
    /** A socket may only join a room it is authorized for (own user channel, or a
     *  workspace it belongs to — resolved transitively for list/task/doc/canvas). */
    async canJoinRoom(client, room) {
        const userId = client.data?.userId;
        if (!userId)
            return false;
        const idx = room.indexOf(':');
        if (idx < 0)
            return false;
        const kind = room.slice(0, idx);
        const id = room.slice(idx + 1);
        if (!id)
            return false;
        if (kind === 'user')
            return id === userId;
        const workspaceId = await this.resolveWorkspaceForRoom(kind, id);
        if (!workspaceId)
            return false;
        const [membership] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        return !!membership;
    }
    async handleConnection(client) {
        const token = client.handshake.auth?.token
            ?? client.handshake.query?.token
            ?? accessTokenFromCookieHeader(client.handshake.headers?.cookie);
        if (!token) {
            client.emit('error', { message: 'Missing auth token' });
            client.disconnect(true);
            return;
        }
        try {
            const payload = this.jwtService.verify(token, {
                secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
            });
            client.data.userId = payload.sub;
            client.data.email = payload.email;
            client.data.role = payload.role;
            // Auto-join the user's private channel.
            client.join(`user:${payload.sub}`);
            // Presence heartbeat: mark online as soon as the socket authenticates.
            void this.presence.recordHeartbeat(payload.sub).catch(() => undefined);
            this.logger.debug(`connected ${client.id} -> user:${payload.sub}`);
        }
        catch {
            client.emit('error', { message: 'Invalid token' });
            client.disconnect(true);
        }
    }
    handleDisconnect(client) {
        // Broadcast a cursor-leave to every canvas room the socket was in so
        // remote clients can drop the avatar immediately instead of waiting for
        // a stale-cursor sweep.
        const data = client.data;
        if (data?.userId) {
            for (const room of client.rooms) {
                if (typeof room === 'string' && room.startsWith('canvas:')) {
                    const canvasId = room.slice('canvas:'.length);
                    this.server?.to(room).emit('event', {
                        type: 'canvas.cursor.leave',
                        canvasId,
                        userId: data.userId,
                    });
                }
            }
        }
        this.logger.debug(`disconnected ${client.id}`);
    }
    /** Keep-alive heartbeat from the client (~every 60s) so presence stays fresh. */
    handlePresencePing(client) {
        const userId = client.data?.userId;
        if (userId)
            void this.presence.recordHeartbeat(userId).catch(() => undefined);
    }
    async handleSubscribe(client, body) {
        if (!Array.isArray(body?.rooms))
            return { ok: false, error: 'rooms must be an array' };
        const joined = [];
        const denied = [];
        for (const room of body.rooms) {
            if (await this.canJoinRoom(client, room)) {
                client.join(room);
                joined.push(room);
            }
            else {
                denied.push(room);
            }
        }
        return { ok: true, joined, denied };
    }
    handleUnsubscribe(client, body) {
        if (!Array.isArray(body?.rooms))
            return { ok: false, error: 'rooms must be an array' };
        for (const room of body.rooms)
            client.leave(room);
        return { ok: true, left: body.rooms };
    }
    /**
     * Collaborator cursor broadcast for whiteboards / mind maps. Receives a
     * raw {canvasId, x, y} payload from the client, stamps it with the
     * connection's authenticated identity, and fans out to all other sockets
     * in the canvas room. Sender is excluded so a client never sees its own
     * cursor reflected back.
     */
    handleCanvasCursor(client, body) {
        const data = client.data;
        if (!data?.userId || !body?.canvasId || typeof body.x !== 'number' || typeof body.y !== 'number') {
            return { ok: false };
        }
        const event = {
            type: 'canvas.cursor',
            canvasId: body.canvasId,
            userId: data.userId,
            displayName: body.displayName ?? data.email ?? data.userId,
            x: body.x,
            y: body.y,
            color: body.color,
        };
        client.to(`canvas:${body.canvasId}`).emit('event', event);
        return { ok: true };
    }
    handleCanvasCursorLeave(client, body) {
        const data = client.data;
        if (!data?.userId || !body?.canvasId)
            return { ok: false };
        const event = {
            type: 'canvas.cursor.leave',
            canvasId: body.canvasId,
            userId: data.userId,
        };
        client.to(`canvas:${body.canvasId}`).emit('event', event);
        return { ok: true };
    }
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
    handleCallSignal(client, body) {
        const data = client.data;
        if (!data?.userId || !body?.callId || !body?.to || !body?.signal)
            return { ok: false };
        // Relayed to the named user only, not broadcast: an offer is for one peer,
        // and fanning it out would have everyone answer the same handshake.
        this.emitToUser(body.to, {
            type: 'call.signal',
            callId: body.callId,
            from: data.userId,
            signal: body.signal,
        });
        return { ok: true };
    }
    /**
     * §2.8 — an in-call reaction, `[20:47]`: "Agar main koi reaction doongi to
     * woh yahan pe show ho jaata hai."
     *
     * Not persisted anywhere. A reaction is a thing that happens and then is
     * over; writing it down would leave a channel full of thumbs-ups nobody
     * meant to keep.
     */
    handleCallReaction(client, body) {
        const data = client.data;
        if (!data?.userId || !body?.callId || !body?.workspaceId || !body?.emoji)
            return { ok: false };
        // Bounded: an emoji is one or two code points, and a "reaction" carrying a
        // paragraph is not a reaction.
        const emoji = String(body.emoji).slice(0, 8);
        this.emitToWorkspace(body.workspaceId, {
            type: 'call.reaction',
            workspaceId: body.workspaceId,
            callId: body.callId,
            userId: data.userId,
            emoji,
        });
        return { ok: true };
    }
    // --- Broadcast helpers ----------------------------------------------------
    emitToRoom(room, event) {
        this.server?.to(room).emit('event', event);
    }
    emitToUser(userId, event) {
        this.server?.to(`user:${userId}`).emit('event', event);
    }
    emitToList(listId, event) {
        this.server?.to(`list:${listId}`).emit('event', event);
    }
    emitToTask(taskId, event) {
        this.server?.to(`task:${taskId}`).emit('event', event);
    }
    emitToWorkspace(workspaceId, event) {
        this.server?.to(`workspace:${workspaceId}`).emit('event', event);
    }
    emitToDoc(docId, event) {
        this.server?.to(`doc:${docId}`).emit('event', event);
    }
};
exports.RealtimeGateway = RealtimeGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RealtimeGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('presence.ping'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], RealtimeGateway.prototype, "handlePresencePing", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('subscribe'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "handleSubscribe", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('unsubscribe'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], RealtimeGateway.prototype, "handleUnsubscribe", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('canvas.cursor'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], RealtimeGateway.prototype, "handleCanvasCursor", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('canvas.cursor.leave'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], RealtimeGateway.prototype, "handleCanvasCursorLeave", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('call.signal'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], RealtimeGateway.prototype, "handleCallSignal", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('call.reaction'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], RealtimeGateway.prototype, "handleCallReaction", null);
exports.RealtimeGateway = RealtimeGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        namespace: '/realtime',
        cors: {
            origin: (origin, cb) => cb(null, true),
            credentials: true,
        },
    }),
    __param(2, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        config_1.ConfigService, Object, presence_service_1.PresenceService])
], RealtimeGateway);
//# sourceMappingURL=realtime.gateway.js.map