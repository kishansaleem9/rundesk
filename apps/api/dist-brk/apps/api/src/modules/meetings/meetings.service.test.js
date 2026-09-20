"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const meetings_service_1 = require("./meetings.service");
/**
 * The action-item loop needs a live model, so the extraction itself is proven
 * against a running API with a key rather than here. What is worth pinning
 * without one is the shape of the refusals — a meeting with nothing written in
 * it, and an environment with no key, must both fail clearly rather than
 * returning an empty list that reads like "no action items were found".
 */
(0, node_test_1.describe)('MeetingsService.extractActionItems', () => {
    const svc = Object.create(meetings_service_1.MeetingsService.prototype);
    const withMeeting = (row, aiAvailable) => {
        ;
        svc.assertMember = async () => ({ role: 'member' });
        svc.load = async () => row;
        svc.ai = { isAvailable: () => aiAvailable };
        return svc;
    };
    (0, node_test_1.it)('refuses a meeting with neither notes nor transcript', async () => {
        const s = withMeeting({ id: 'm', title: 'Empty', notes: null, transcript: null }, true);
        await strict_1.default.rejects(() => s.extractActionItems('ws', 'm', 'u'), /no notes or transcript/i, 'an empty meeting should say so, not return an empty list');
    });
    (0, node_test_1.it)('treats whitespace-only notes as empty', async () => {
        const s = withMeeting({ id: 'm', title: 'Blank', notes: '   \n  ', transcript: null }, true);
        await strict_1.default.rejects(() => s.extractActionItems('ws', 'm', 'u'), /no notes or transcript/i);
    });
    (0, node_test_1.it)('falls back to the transcript when there are no notes', async () => {
        // Reaching the AI check means it accepted the transcript as the source.
        const s = withMeeting({ id: 'm', title: 'Recorded', notes: null, transcript: 'we agreed to ship' }, false);
        await strict_1.default.rejects(() => s.extractActionItems('ws', 'm', 'u'), /not configured/i);
    });
    (0, node_test_1.it)('says the key is missing rather than returning nothing', async () => {
        const s = withMeeting({ id: 'm', title: 'Sync', notes: 'do the thing', transcript: null }, false);
        await strict_1.default.rejects(() => s.extractActionItems('ws', 'm', 'u'), /AI features are not configured/, 'a missing key must not look like a meeting with no action items');
    });
});
//# sourceMappingURL=meetings.service.test.js.map