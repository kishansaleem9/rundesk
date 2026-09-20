"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const email_to_task_service_1 = require("./email-to-task.service");
/**
 * The service blends DB / R2 / realtime with deterministic parsing.
 * These tests focus on the parsing + idempotency + size-limit paths
 * that don't need an actual database — the bulk of the integration
 * logic is exercised end-to-end via the webhook tests in higher tiers.
 */
function buildSvc() {
    const db = {
        select: node_test_1.mock.fn(() => ({
            from: node_test_1.mock.fn(() => ({
                where: node_test_1.mock.fn(() => ({ limit: node_test_1.mock.fn(async () => []) })),
            })),
        })),
        insert: node_test_1.mock.fn(() => ({
            values: node_test_1.mock.fn(() => ({
                onConflictDoNothing: node_test_1.mock.fn(async () => undefined),
                onConflictDoUpdate: node_test_1.mock.fn(async () => undefined),
                returning: node_test_1.mock.fn(async () => [{ id: 'x-1' }]),
            })),
        })),
        update: node_test_1.mock.fn(() => ({
            set: node_test_1.mock.fn(() => ({ where: node_test_1.mock.fn(async () => undefined) })),
        })),
        delete: node_test_1.mock.fn(() => ({ where: node_test_1.mock.fn(async () => undefined) })),
    };
    const r2 = { putObject: node_test_1.mock.fn(async () => undefined) };
    const realtime = { emitToList: node_test_1.mock.fn(), emitToTask: node_test_1.mock.fn() };
    return new email_to_task_service_1.EmailToTaskService(db, r2, realtime);
}
(0, node_test_1.describe)('EmailToTaskService.parseRecipient', () => {
    (0, node_test_1.it)('parses a bare list alias', () => {
        const svc = buildSvc();
        strict_1.default.deepEqual(svc.parseRecipient('list-abc123@inbound.rundesk.app'), {
            localPart: 'abc123',
        });
    });
    (0, node_test_1.it)('parses a sub-addressed task reply', () => {
        const svc = buildSvc();
        strict_1.default.deepEqual(svc.parseRecipient('list-abc123+task-11111111-1111-1111-1111-111111111111@inbound.rundesk.app'), { localPart: 'abc123', taskId: '11111111-1111-1111-1111-111111111111' });
    });
    (0, node_test_1.it)('lower-cases the recipient', () => {
        const svc = buildSvc();
        strict_1.default.deepEqual(svc.parseRecipient('LIST-AbcDef@INBOUND.example.com'), {
            localPart: 'abcdef',
        });
    });
    (0, node_test_1.it)('rejects unprefixed addresses', () => {
        const svc = buildSvc();
        strict_1.default.equal(svc.parseRecipient('hello@example.com'), null);
        strict_1.default.equal(svc.parseRecipient('list-@example.com'), null);
    });
    (0, node_test_1.it)('rejects malformed addresses', () => {
        const svc = buildSvc();
        strict_1.default.equal(svc.parseRecipient(''), null);
        strict_1.default.equal(svc.parseRecipient('@example.com'), null);
        strict_1.default.equal(svc.parseRecipient('plainstring'), null);
        strict_1.default.equal(svc.parseRecipient('list-abc+task-@example.com'), null); // empty task id
    });
});
(0, node_test_1.describe)('EmailToTaskService.ingest dedupe', () => {
    (0, node_test_1.it)('rejects a duplicate Message-Id without re-processing', async () => {
        const svc = buildSvc();
        svc.findExistingByMessageId = async () => ({ id: 'prev-1' });
        const result = await svc.ingest({
            messageId: '<dup@example.com>',
            fromAddress: 'alice@example.com',
            recipient: 'list-abc@inbound.rundesk.local',
        });
        strict_1.default.equal(result.outcome, 'rejected_duplicate');
    });
    (0, node_test_1.it)('rejects payloads larger than 25MB', async () => {
        const svc = buildSvc();
        svc.findExistingByMessageId = async () => null;
        svc.resolveReplyContext = async () => null;
        svc.recordOutcome = async () => undefined;
        const huge = Buffer.alloc(26 * 1024 * 1024);
        const result = await svc.ingest({
            messageId: '<huge@example.com>',
            fromAddress: 'alice@example.com',
            recipient: 'list-abc@inbound.rundesk.local',
            attachments: [{ fileName: 'x.bin', contentType: 'application/octet-stream', content: huge }],
        });
        strict_1.default.equal(result.outcome, 'rejected_too_large');
        strict_1.default.match(result.reason ?? '', /exceeds 25MB/);
    });
    (0, node_test_1.it)('rejects an unrecognised recipient with rejected_no_alias', async () => {
        const svc = buildSvc();
        svc.findExistingByMessageId = async () => null;
        svc.resolveReplyContext = async () => null;
        svc.recordOutcome = async () => undefined;
        const result = await svc.ingest({
            messageId: '<m1@example.com>',
            fromAddress: 'alice@example.com',
            recipient: 'random@example.com',
        });
        strict_1.default.equal(result.outcome, 'rejected_no_alias');
    });
});
//# sourceMappingURL=email-to-task.service.test.js.map