"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const zoom_recordings_util_1 = require("./zoom-recordings.util");
/**
 * §12.9 — Zoom cloud-recording response parsing. Pure, no DB / no network.
 */
(0, node_test_1.describe)('extractZoomRecordingUrl', () => {
    (0, node_test_1.it)('prefers the top-level share_url', () => {
        const out = (0, zoom_recordings_util_1.extractZoomRecordingUrl)({
            id: 88,
            topic: 'Design review',
            share_url: 'https://zoom.us/rec/share/abc',
            recording_count: 2,
            total_size: 1234,
            recording_files: [
                { file_type: 'MP4', play_url: 'https://zoom.us/rec/play/mp4', download_url: 'https://zoom.us/rec/dl/mp4', status: 'completed' },
                { file_type: 'M4A', play_url: 'https://zoom.us/rec/play/m4a', status: 'completed' },
            ],
        });
        strict_1.default.ok(out);
        strict_1.default.equal(out.shareUrl, 'https://zoom.us/rec/share/abc');
        strict_1.default.equal(out.playUrl, 'https://zoom.us/rec/play/mp4', 'picks the MP4 video file play url');
        strict_1.default.equal(out.downloadUrl, 'https://zoom.us/rec/dl/mp4');
        strict_1.default.equal(out.topic, 'Design review');
        strict_1.default.equal(out.recordingCount, 2);
        strict_1.default.equal(out.totalSize, 1234);
    });
    (0, node_test_1.it)('falls back to the video file play_url when there is no share_url', () => {
        const out = (0, zoom_recordings_util_1.extractZoomRecordingUrl)({
            id: 88,
            recording_files: [
                { file_type: 'M4A', play_url: 'https://zoom.us/rec/play/audio' },
                { file_type: 'MP4', play_url: 'https://zoom.us/rec/play/video', status: 'completed' },
            ],
        });
        strict_1.default.ok(out);
        strict_1.default.equal(out.shareUrl, 'https://zoom.us/rec/play/video');
    });
    (0, node_test_1.it)('falls back to download_url when no share_url and no play_url', () => {
        const out = (0, zoom_recordings_util_1.extractZoomRecordingUrl)({
            id: 88,
            recording_files: [{ file_type: 'MP4', download_url: 'https://zoom.us/rec/dl/only', status: 'completed' }],
        });
        strict_1.default.ok(out);
        strict_1.default.equal(out.shareUrl, 'https://zoom.us/rec/dl/only');
    });
    (0, node_test_1.it)('returns null when there is no usable url', () => {
        strict_1.default.equal((0, zoom_recordings_util_1.extractZoomRecordingUrl)({ id: 88, recording_files: [] }), null);
        strict_1.default.equal((0, zoom_recordings_util_1.extractZoomRecordingUrl)({ id: 88 }), null);
        strict_1.default.equal((0, zoom_recordings_util_1.extractZoomRecordingUrl)(null), null);
        strict_1.default.equal((0, zoom_recordings_util_1.extractZoomRecordingUrl)(undefined), null);
    });
    (0, node_test_1.it)('ignores an empty share_url string and uses a file url instead', () => {
        const out = (0, zoom_recordings_util_1.extractZoomRecordingUrl)({
            share_url: '',
            recording_files: [{ file_type: 'MP4', play_url: 'https://zoom.us/rec/play/x', status: 'completed' }],
        });
        strict_1.default.ok(out);
        strict_1.default.equal(out.shareUrl, 'https://zoom.us/rec/play/x');
    });
});
(0, node_test_1.describe)('extractMeetingIdFromWebhook', () => {
    (0, node_test_1.it)('reads payload.object.id as a string', () => {
        strict_1.default.equal((0, zoom_recordings_util_1.extractMeetingIdFromWebhook)({ event: 'recording.completed', payload: { object: { id: 88 } } }), '88');
    });
    (0, node_test_1.it)('handles a string id already', () => {
        strict_1.default.equal((0, zoom_recordings_util_1.extractMeetingIdFromWebhook)({ payload: { object: { id: '99' } } }), '99');
    });
    (0, node_test_1.it)('returns null when the shape is missing', () => {
        strict_1.default.equal((0, zoom_recordings_util_1.extractMeetingIdFromWebhook)({}), null);
        strict_1.default.equal((0, zoom_recordings_util_1.extractMeetingIdFromWebhook)({ payload: {} }), null);
        strict_1.default.equal((0, zoom_recordings_util_1.extractMeetingIdFromWebhook)(null), null);
    });
});
//# sourceMappingURL=zoom-recordings.util.test.js.map