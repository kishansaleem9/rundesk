"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const zoom_recordings_service_1 = require("./zoom-recordings.service");
/**
 * §12.9 — recording.completed → recording-link service. DB + Zoom API mocked;
 * asserts the env-gate on the Zoom connection, idempotency, and that the
 * extracted share URL is persisted as a kind:'recording' link.
 */
function makeDb(selectResults) {
    const queue = [...selectResults];
    const inserted = [];
    const VERBS = ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'set'];
    const node = (rows) => {
        const p = Promise.resolve(rows);
        for (const v of VERBS)
            p[v] = () => p;
        return p;
    };
    const db = {
        select: node_test_1.mock.fn(() => node(queue.shift() ?? [])),
        insert: node_test_1.mock.fn(() => ({
            values: (v) => {
                inserted.push(v);
                return Promise.resolve([]);
            },
        })),
        update: node_test_1.mock.fn(() => ({ set: () => ({ where: () => Promise.resolve([]) }) })),
    };
    return { db, inserted };
}
const MEETING_LINK = {
    id: 'link-1',
    taskId: 't1',
    workspaceId: 'w1',
    title: 'Design review',
    metadata: { meeting: { id: '88' } },
};
const FUTURE = new Date(Date.now() + 3_600_000);
const ZOOM_CONN = [{ id: 'c1', status: 'connected', accessToken: 'ztok', refreshToken: null, tokenExpiresAt: FUTURE }];
const webhook = { event: 'recording.completed', payload: { object: { id: 88 } } };
(0, node_test_1.describe)('ZoomRecordingsService.handleRecordingCompleted', () => {
    (0, node_test_1.it)('fetches the recording and attaches a kind:recording link', async () => {
        // selects: [meeting links, existing-recording-check(empty), zoom connection]
        const { db, inserted } = makeDb([[MEETING_LINK], [], ZOOM_CONN]);
        const svc = new zoom_recordings_service_1.ZoomRecordingsService(db);
        const fetchMock = node_test_1.mock.method(globalThis, 'fetch', async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                id: 88,
                topic: 'Design review',
                share_url: 'https://zoom.us/rec/share/xyz',
                recording_files: [{ file_type: 'MP4', play_url: 'https://zoom.us/rec/play/xyz', status: 'completed' }],
            }),
        }));
        try {
            const summary = await svc.handleRecordingCompleted(webhook);
            strict_1.default.equal(summary.meetingId, '88');
            strict_1.default.equal(summary.attached, 1);
            strict_1.default.equal(summary.skippedExisting, 0);
            const [reqUrl] = fetchMock.mock.calls[0].arguments;
            strict_1.default.match(String(reqUrl), /meetings\/88\/recordings/);
            strict_1.default.equal(inserted.length, 1);
            strict_1.default.equal(inserted[0].taskId, 't1');
            strict_1.default.equal(inserted[0].provider, 'zoom');
            strict_1.default.equal(inserted[0].kind, 'recording');
            strict_1.default.equal(inserted[0].url, 'https://zoom.us/rec/share/xyz');
            strict_1.default.equal(inserted[0].externalId, '88');
            strict_1.default.equal(inserted[0].metadata.source, 'zoom_webhook');
            strict_1.default.equal(inserted[0].metadata.recordingUrl, 'https://zoom.us/rec/share/xyz');
        }
        finally {
            fetchMock.mock.restore();
        }
    });
    (0, node_test_1.it)('is idempotent: skips when a recording is already attached for the meeting', async () => {
        // existing-recording-check returns a row
        const { db, inserted } = makeDb([[MEETING_LINK], [{ id: 'rec-existing' }]]);
        const svc = new zoom_recordings_service_1.ZoomRecordingsService(db);
        const fetchMock = node_test_1.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({}) }));
        try {
            const summary = await svc.handleRecordingCompleted(webhook);
            strict_1.default.equal(summary.attached, 0);
            strict_1.default.equal(summary.skippedExisting, 1);
            strict_1.default.equal(fetchMock.mock.callCount(), 0, 'no Zoom API call when already attached');
            strict_1.default.equal(inserted.length, 0);
        }
        finally {
            fetchMock.mock.restore();
        }
    });
    (0, node_test_1.it)('env-gate: skips when the workspace has no Zoom connection', async () => {
        // existing-check empty, connection lookups empty (fetchRecording + distinguisher)
        const { db, inserted } = makeDb([[MEETING_LINK], [], [], []]);
        const svc = new zoom_recordings_service_1.ZoomRecordingsService(db);
        const fetchMock = node_test_1.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({}) }));
        try {
            const summary = await svc.handleRecordingCompleted(webhook);
            strict_1.default.equal(summary.attached, 0);
            strict_1.default.equal(summary.skippedNoConnection, 1);
            strict_1.default.equal(fetchMock.mock.callCount(), 0, 'no Zoom API call when unconnected');
            strict_1.default.equal(inserted.length, 0);
        }
        finally {
            fetchMock.mock.restore();
        }
    });
    (0, node_test_1.it)('no-ops cleanly when the webhook carries no meeting id', async () => {
        const { db, inserted } = makeDb([]);
        const svc = new zoom_recordings_service_1.ZoomRecordingsService(db);
        const summary = await svc.handleRecordingCompleted({ event: 'recording.completed', payload: {} });
        strict_1.default.equal(summary.meetingId, null);
        strict_1.default.equal(summary.meetingLinks, 0);
        strict_1.default.equal(inserted.length, 0);
    });
    (0, node_test_1.it)('no-ops when no task meeting-link matches the meeting id', async () => {
        const { db } = makeDb([[]]); // meeting-links select → empty
        const svc = new zoom_recordings_service_1.ZoomRecordingsService(db);
        const summary = await svc.handleRecordingCompleted(webhook);
        strict_1.default.equal(summary.meetingLinks, 0);
        strict_1.default.equal(summary.attached, 0);
    });
});
//# sourceMappingURL=zoom-recordings.service.test.js.map