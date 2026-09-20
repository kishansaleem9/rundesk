"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const spreadsheet_import_util_1 = require("./spreadsheet-import.util");
const trello = [
    'Card Name,Card Description,Due Date,Members,Labels,List Name',
    'Ship the thing,"Needs a, comma",2026-03-04,ada@example.com,"urgent,api",Doing',
].join('\n');
(0, node_test_1.describe)('delimiter + row splitting', () => {
    (0, node_test_1.it)('reads a comma file as comma and a tab file as tab', () => {
        strict_1.default.equal((0, spreadsheet_import_util_1.detectDelimiter)(trello), ',');
        strict_1.default.equal((0, spreadsheet_import_util_1.detectDelimiter)('a\tb\tc\n1\t2\t3'), '\t');
    });
    (0, node_test_1.it)('does not count a delimiter inside quotes', () => {
        // Three tabs outside quotes beats the commas inside the quoted header.
        strict_1.default.equal((0, spreadsheet_import_util_1.detectDelimiter)('"a,b,c"\tx\ty\tz'), '\t');
    });
    (0, node_test_1.it)('splits quoted cells containing the delimiter', () => {
        strict_1.default.deepEqual((0, spreadsheet_import_util_1.splitDelimitedRow)('a,"b,c",d', ','), ['a', 'b,c', 'd']);
        strict_1.default.deepEqual((0, spreadsheet_import_util_1.splitDelimitedRow)('a\t"b\tc"\td', '\t'), ['a', 'b\tc', 'd']);
    });
});
(0, node_test_1.describe)('presets', () => {
    (0, node_test_1.it)('maps a Trello export onto the task fields', () => {
        const table = (0, spreadsheet_import_util_1.parseSheet)(trello);
        const mapping = (0, spreadsheet_import_util_1.autoMap)(table.headers, 'trello');
        strict_1.default.equal(mapping['Card Name'], 'title');
        strict_1.default.equal(mapping['Card Description'], 'description');
        strict_1.default.equal(mapping['Members'], 'assignees');
        strict_1.default.equal(mapping['Labels'], 'tags');
        strict_1.default.equal(mapping['List Name'], 'list');
        strict_1.default.equal((0, spreadsheet_import_util_1.mappingError)(mapping), null);
    });
    (0, node_test_1.it)('falls back to the generic preset for columns a named source does not know', () => {
        const mapping = (0, spreadsheet_import_util_1.autoMap)(['Card Name', 'Status'], 'trello');
        strict_1.default.equal(mapping['Status'], 'status'); // from generic, not from trello
    });
    (0, node_test_1.it)('never maps two columns to Title', () => {
        const mapping = (0, spreadsheet_import_util_1.autoMap)(['Name', 'Task Name'], 'generic');
        strict_1.default.equal((Object.values(mapping).filter((f) => f === 'title')).length, 1);
    });
    (0, node_test_1.it)('refuses a mapping with no title at all', () => {
        strict_1.default.match(String((0, spreadsheet_import_util_1.mappingError)({ Status: 'status' })), /Title/);
    });
    (0, node_test_1.it)('names every source from the frame exactly once, and draws no control for the four it cannot do', () => {
        const keys = spreadsheet_import_util_1.SHEET_SOURCES.map((s) => s.key);
        strict_1.default.equal(new Set(keys).size, keys.length);
        const unsupported = spreadsheet_import_util_1.UNSUPPORTED_SOURCES.map((u) => u.key);
        for (const k of unsupported)
            strict_1.default.ok(!(keys).includes(k));
        for (const u of spreadsheet_import_util_1.UNSUPPORTED_SOURCES)
            strict_1.default.ok((u.reason.length) > 30);
    });
});
(0, node_test_1.describe)('priority scales', () => {
    (0, node_test_1.it)('reads Todoist numbers as the inverse of ClickUp numbers', () => {
        strict_1.default.equal((0, spreadsheet_import_util_1.normalizePriority)('4', 'todoist'), 'urgent');
        strict_1.default.equal((0, spreadsheet_import_util_1.normalizePriority)('1', 'todoist'), 'low');
        strict_1.default.equal((0, spreadsheet_import_util_1.normalizePriority)('1', 'clickup'), 'urgent');
        strict_1.default.equal((0, spreadsheet_import_util_1.normalizePriority)('4', 'clickup'), 'low');
    });
    (0, node_test_1.it)('reads Jira words, including the two a substring match gets wrong', () => {
        strict_1.default.equal((0, spreadsheet_import_util_1.normalizePriority)('Highest', 'text'), 'urgent');
        strict_1.default.equal((0, spreadsheet_import_util_1.normalizePriority)('Lowest', 'text'), 'low');
        strict_1.default.equal((0, spreadsheet_import_util_1.normalizePriority)('High', 'text'), 'high');
        strict_1.default.equal((0, spreadsheet_import_util_1.normalizePriority)('Medium', 'text'), 'normal');
    });
    (0, node_test_1.it)('ignores numbers in a text-scale source rather than guessing', () => {
        strict_1.default.equal((0, spreadsheet_import_util_1.normalizePriority)('3', 'text'), 'normal');
    });
});
(0, node_test_1.describe)('status categories', () => {
    (0, node_test_1.it)('pins the six default statuses to their buckets', () => {
        strict_1.default.deepEqual(spreadsheet_import_util_1.DEFAULT_STATUSES.map((s) => `${s.key}:${s.category}`), ['backlog:open', 'todo:open', 'in_progress:in_progress', 'in_review:in_progress', 'done:closed', 'cancelled:closed']);
        strict_1.default.equal((0, spreadsheet_import_util_1.statusCategoryOf)('done'), 'closed');
        strict_1.default.equal((0, spreadsheet_import_util_1.statusCategoryOf)('todo'), 'open');
    });
});
(0, node_test_1.describe)('row rejection', () => {
    const csv = [
        'Name,Due Date,Status',
        'Good one,2026-03-04,Done',
        ',2026-03-04,Done',
        'Bad date,tomorrow?,Done',
        'Ragged,2026-03-04,Done,extra',
        '',
    ].join('\n');
    const run = () => {
        const table = (0, spreadsheet_import_util_1.parseSheet)(csv);
        return (0, spreadsheet_import_util_1.mapSheet)(table, (0, spreadsheet_import_util_1.autoMap)(table.headers, 'generic'), { priorityScale: 'clickup' });
    };
    (0, node_test_1.it)('keeps the good row and refuses the three bad ones', () => {
        const { rows, rejections } = run();
        strict_1.default.deepEqual(rows.map((r) => r.title), ['Good one']);
        strict_1.default.deepEqual(rejections.map((r) => r.code), ['title_missing', 'invalid_date', 'ragged_row']);
    });
    (0, node_test_1.it)('reports the file line number and the offending column on each refusal', () => {
        const { rejections } = run();
        strict_1.default.deepEqual(rejections.map((r) => r.row), [3, 4, 5]);
        strict_1.default.equal(rejections[1].column, 'Due Date');
        strict_1.default.equal(rejections[1].value, 'tomorrow?');
        strict_1.default.ok(String(rejections[1].message).includes('Row 4'), rejections[1].message);
        strict_1.default.ok(String(rejections[1].message).includes('tomorrow?'), rejections[1].message);
    });
    (0, node_test_1.it)('stamps the status category on the row it accepts', () => {
        const { rows } = run();
        strict_1.default.equal(rows[0].status, 'done');
        strict_1.default.equal(rows[0].statusCategory, 'closed');
    });
    (0, node_test_1.it)('refuses a title over the 500-character limit', () => {
        const table = (0, spreadsheet_import_util_1.parseSheet)(`Name\n${'x'.repeat(501)}`);
        const { rows, rejections } = (0, spreadsheet_import_util_1.mapSheet)(table, (0, spreadsheet_import_util_1.autoMap)(table.headers, 'generic'), { priorityScale: 'clickup' });
        strict_1.default.equal((rows).length, 0);
        strict_1.default.equal(rejections[0].code, 'title_too_long');
        strict_1.default.ok(String(rejections[0].message).includes('501'), rejections[0].message);
    });
});
//# sourceMappingURL=spreadsheet-import.util.test.js.map