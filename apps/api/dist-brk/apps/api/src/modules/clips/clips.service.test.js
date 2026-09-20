"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const clips_service_1 = require("./clips.service");
function createDbMock(options) {
    return {
        select: node_test_1.mock.fn(() => ({
            from: node_test_1.mock.fn(() => ({
                innerJoin: node_test_1.mock.fn(() => ({
                    where: node_test_1.mock.fn(() => ({
                        limit: node_test_1.mock.fn(async () => options?.memberEmail ? [{ email: options.memberEmail }] : []),
                    })),
                })),
            })),
        })),
    };
}
function createR2Mock() {
    return {
        configured: true,
        presignPutObject: node_test_1.mock.fn(async (key) => `https://upload.example/${encodeURIComponent(key)}`),
        listObjects: node_test_1.mock.fn(async () => ({
            Contents: [
                {
                    Key: 'workspaces/ws-1/clips/200-second.webm',
                    Size: 200,
                    LastModified: new Date('2026-05-08T10:00:00Z'),
                },
                {
                    Key: 'workspaces/ws-1/clips/100-first.webm',
                    Size: 100,
                    LastModified: new Date('2026-05-08T09:00:00Z'),
                },
            ],
        })),
        headObject: node_test_1.mock.fn(async (key) => ({
            Metadata: {
                title: key.includes('second') ? 'Second clip' : 'First clip',
                durationseconds: key.includes('second') ? '40' : '10',
                recordedby: 'owner@rundesk.dev',
            },
        })),
        getObjectUrl: node_test_1.mock.fn(async (key) => `https://cdn.example/${encodeURIComponent(key)}`),
        deleteObject: node_test_1.mock.fn(async () => undefined),
    };
}
function createEmailMock() {
    return {
        sendClipSharedEmail: node_test_1.mock.fn(async () => undefined),
    };
}
(0, node_test_1.describe)('ClipsService', () => {
    (0, node_test_1.it)('creates upload URL for clip recording', async () => {
        const r2 = createR2Mock();
        const email = createEmailMock();
        const db = createDbMock();
        const svc = new clips_service_1.ClipsService(r2, email, db);
        const result = await svc.createUploadUrl('ws-1', 'owner@rundesk.dev', {
            fileName: 'demo clip.webm',
            contentType: 'video/webm',
            durationSeconds: 15,
            title: 'Demo clip',
        });
        strict_1.default.ok(result.uploadUrl.includes('https://upload.example/'));
        strict_1.default.ok(result.storageKey.includes('workspaces/ws-1/clips/'));
        strict_1.default.equal(r2.presignPutObject.mock.calls.length, 1);
    });
    (0, node_test_1.it)('lists clips sorted by newest first', async () => {
        const svc = new clips_service_1.ClipsService(createR2Mock(), createEmailMock(), createDbMock());
        const clips = await svc.list('ws-1');
        strict_1.default.equal(clips.length, 2);
        strict_1.default.equal(clips[0].title, 'Second clip');
        strict_1.default.equal(clips[1].title, 'First clip');
    });
    (0, node_test_1.it)('deletes clip with workspace-bound key', async () => {
        const r2 = createR2Mock();
        const svc = new clips_service_1.ClipsService(r2, createEmailMock(), createDbMock());
        const out = await svc.remove('ws-1', 'workspaces/ws-1/clips/a.webm');
        strict_1.default.equal(out.ok, true);
        strict_1.default.equal(r2.deleteObject.mock.calls.length, 1);
        strict_1.default.equal(r2.deleteObject.mock.calls[0].arguments[0], 'workspaces/ws-1/clips/a.webm');
    });
    (0, node_test_1.it)('rejects delete for foreign workspace key', async () => {
        const svc = new clips_service_1.ClipsService(createR2Mock(), createEmailMock(), createDbMock());
        await strict_1.default.rejects(() => svc.remove('ws-1', 'workspaces/ws-2/clips/a.webm'), (error) => error instanceof common_1.BadRequestException);
    });
    (0, node_test_1.it)('shares public clip without triggering email', async () => {
        const email = createEmailMock();
        const svc = new clips_service_1.ClipsService(createR2Mock(), email, createDbMock());
        const out = await svc.share('ws-1', 'actor-1', 'owner@rundesk.dev', {
            storageKey: 'workspaces/ws-1/clips/a.webm',
            mode: 'public',
        });
        strict_1.default.ok(out.shareUrl.includes('https://cdn.example/'));
        strict_1.default.equal(email.sendClipSharedEmail.mock.calls.length, 0);
    });
    (0, node_test_1.it)('shares clip to workspace member and sends email', async () => {
        const email = createEmailMock();
        const svc = new clips_service_1.ClipsService(createR2Mock(), email, createDbMock({ memberEmail: 'member@rundesk.dev' }));
        const out = await svc.share('ws-1', 'actor-1', 'owner@rundesk.dev', {
            storageKey: 'workspaces/ws-1/clips/a.webm',
            mode: 'member',
            userId: 'u-1',
        });
        strict_1.default.equal(out.sentTo, 'member@rundesk.dev');
        strict_1.default.equal(email.sendClipSharedEmail.mock.calls.length, 1);
    });
    (0, node_test_1.it)('throws when sharing to member without userId', async () => {
        const svc = new clips_service_1.ClipsService(createR2Mock(), createEmailMock(), createDbMock());
        await strict_1.default.rejects(() => svc.share('ws-1', 'actor-1', 'owner@rundesk.dev', {
            storageKey: 'workspaces/ws-1/clips/a.webm',
            mode: 'member',
        }), (error) => error instanceof common_1.BadRequestException);
    });
    (0, node_test_1.it)('throws when member is missing in workspace', async () => {
        const svc = new clips_service_1.ClipsService(createR2Mock(), createEmailMock(), createDbMock({ memberEmail: null }));
        await strict_1.default.rejects(() => svc.share('ws-1', 'actor-1', 'owner@rundesk.dev', {
            storageKey: 'workspaces/ws-1/clips/a.webm',
            mode: 'member',
            userId: 'u-404',
        }), (error) => error instanceof common_1.NotFoundException);
    });
});
//# sourceMappingURL=clips.service.test.js.map