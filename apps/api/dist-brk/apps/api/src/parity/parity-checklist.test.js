"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const CHECKLIST_PATH = node_path_1.default.resolve(process.cwd(), '../../config/parity-checklist.json');
function isKebabCase(value) {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
(0, node_test_1.default)('parity checklist has valid structure', async () => {
    const raw = await (0, promises_1.readFile)(CHECKLIST_PATH, 'utf8');
    const checklist = JSON.parse(raw);
    strict_1.default.ok(checklist.version, 'version is required');
    strict_1.default.ok(checklist.owner, 'owner is required');
    strict_1.default.ok(Array.isArray(checklist.tracks), 'tracks must be an array');
    strict_1.default.ok(checklist.tracks.length >= 10, 'at least 10 tracks are required');
    const seenTrackIds = new Set();
    const seenItems = new Set();
    for (const track of checklist.tracks) {
        strict_1.default.ok(track.title.length > 0, `track ${track.id} must have title`);
        strict_1.default.ok(isKebabCase(track.id), `track id must be kebab-case: ${track.id}`);
        strict_1.default.ok(!seenTrackIds.has(track.id), `duplicate track id: ${track.id}`);
        seenTrackIds.add(track.id);
        strict_1.default.ok(Array.isArray(track.items), `track ${track.id} items must be array`);
        strict_1.default.ok(track.items.length >= 4, `track ${track.id} must have at least 4 items`);
        for (const item of track.items) {
            strict_1.default.ok(isKebabCase(item), `item id must be kebab-case: ${item}`);
            const namespaced = `${track.id}:${item}`;
            strict_1.default.ok(!seenItems.has(namespaced), `duplicate item id in track ${track.id}: ${item}`);
            seenItems.add(namespaced);
        }
    }
});
//# sourceMappingURL=parity-checklist.test.js.map