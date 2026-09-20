"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const clickup_csv_util_1 = require("./clickup-csv.util");
/**
 * §12.5 ClickUp import — pure CSV helpers.
 *   1. Custom-field DETECTION: columns beyond the known task/built-in fields
 *      become custom fields, with a type inferred from their values.
 *   2. Value coercion into the stored { v } shape.
 *   3. Duplicate keying.
 */
(0, node_test_1.describe)('parseClickUpCsv — custom-field detection', () => {
    (0, node_test_1.it)('detects columns beyond the known task fields and infers their types', () => {
        const csv = [
            'Task Name,Status,Priority,List,Budget,Region,Approved,Kickoff',
            'Alpha,todo,high,Sprint 1,100,North,true,2024-01-05',
            'Beta,in progress,normal,Sprint 1,250,South,false,2024-02-11',
            'Gamma,done,low,Sprint 1,175,North,true,2024-03-01',
        ].join('\n');
        const { rows, customFieldColumns } = (0, clickup_csv_util_1.parseClickUpCsv)(csv);
        strict_1.default.equal(rows.length, 3);
        const byName = new Map(customFieldColumns.map((c) => [c.name, c]));
        // Known columns must NOT be treated as custom fields.
        for (const known of ['Task Name', 'Status', 'Priority', 'List']) {
            strict_1.default.equal(byName.has(known), false, `${known} should not be a custom field`);
        }
        // Custom columns detected with inferred types.
        strict_1.default.equal(byName.get('Budget')?.type, 'number');
        strict_1.default.equal(byName.get('Region')?.type, 'dropdown');
        strict_1.default.equal(byName.get('Approved')?.type, 'checkbox');
        strict_1.default.equal(byName.get('Kickoff')?.type, 'date');
        // Dropdown carries de-duplicated options.
        const region = byName.get('Region');
        strict_1.default.deepEqual(region.options?.map((o) => o.value).sort(), ['North', 'South']);
        // Raw custom cells attach to the row.
        strict_1.default.equal(rows[0].custom['Budget'], '100');
        strict_1.default.equal(rows[0].custom['Region'], 'North');
    });
    (0, node_test_1.it)('ignores standard ClickUp export columns (Space, Date Created, Time Estimate…)', () => {
        const csv = [
            'Task Name,List,Space,Date Created,Time Estimate,Assignees,Tags,Story Points',
            'Alpha,L1,Marketing,2024-01-01,3600,Alice,urgent,5',
        ].join('\n');
        const { customFieldColumns } = (0, clickup_csv_util_1.parseClickUpCsv)(csv);
        const names = customFieldColumns.map((c) => c.name);
        // Only the genuinely user-defined column survives.
        strict_1.default.deepEqual(names, ['Story Points']);
        strict_1.default.equal(customFieldColumns[0].type, 'number');
    });
    (0, node_test_1.it)('returns no custom fields for a plain export', () => {
        const csv = 'Task Name,Status,List\nAlpha,todo,L1\nBeta,done,L1';
        const { customFieldColumns } = (0, clickup_csv_util_1.parseClickUpCsv)(csv);
        strict_1.default.equal(customFieldColumns.length, 0);
    });
    (0, node_test_1.it)('handles an empty / header-only CSV', () => {
        strict_1.default.deepEqual((0, clickup_csv_util_1.parseClickUpCsv)(''), { rows: [], headers: [], customFieldColumns: [] });
        strict_1.default.deepEqual((0, clickup_csv_util_1.parseClickUpCsv)('Task Name,Status').rows, []);
    });
});
(0, node_test_1.describe)('inferCustomFieldType', () => {
    (0, node_test_1.it)('checkbox for boolean-ish values', () => {
        strict_1.default.equal((0, clickup_csv_util_1.inferCustomFieldType)(['true', 'false', 'yes', 'no']), 'checkbox');
        strict_1.default.equal((0, clickup_csv_util_1.inferCustomFieldType)(['checked', 'unchecked']), 'checkbox');
    });
    (0, node_test_1.it)('number when every value parses numeric', () => {
        strict_1.default.equal((0, clickup_csv_util_1.inferCustomFieldType)(['1', '2.5', '-3', '1000']), 'number');
    });
    (0, node_test_1.it)('date when values parse as dates but are not plain numbers', () => {
        strict_1.default.equal((0, clickup_csv_util_1.inferCustomFieldType)(['2024-01-01', '2024-02-02']), 'date');
    });
    (0, node_test_1.it)('dropdown for low-cardinality repeated strings', () => {
        strict_1.default.equal((0, clickup_csv_util_1.inferCustomFieldType)(['A', 'B', 'A', 'B', 'A']), 'dropdown');
    });
    (0, node_test_1.it)('text for free-form / unique strings', () => {
        strict_1.default.equal((0, clickup_csv_util_1.inferCustomFieldType)(['hello world', 'a note', 'another entirely']), 'text');
    });
    (0, node_test_1.it)('text for an all-empty column', () => {
        strict_1.default.equal((0, clickup_csv_util_1.inferCustomFieldType)(['', '', '']), 'text');
    });
});
(0, node_test_1.describe)('coerceCustomValue', () => {
    (0, node_test_1.it)('coerces checkbox tokens to booleans', () => {
        strict_1.default.equal((0, clickup_csv_util_1.coerceCustomValue)('checkbox', 'true'), true);
        strict_1.default.equal((0, clickup_csv_util_1.coerceCustomValue)('checkbox', 'No'), false);
        strict_1.default.equal((0, clickup_csv_util_1.coerceCustomValue)('checkbox', 'maybe'), null);
    });
    (0, node_test_1.it)('coerces numbers', () => {
        strict_1.default.equal((0, clickup_csv_util_1.coerceCustomValue)('number', '42'), 42);
        strict_1.default.equal((0, clickup_csv_util_1.coerceCustomValue)('number', 'abc'), null);
    });
    (0, node_test_1.it)('coerces dates to ISO strings', () => {
        strict_1.default.equal((0, clickup_csv_util_1.coerceCustomValue)('date', '2024-01-05'), new Date('2024-01-05').toISOString());
    });
    (0, node_test_1.it)('passes text / dropdown through trimmed', () => {
        strict_1.default.equal((0, clickup_csv_util_1.coerceCustomValue)('text', '  hi  '), 'hi');
        strict_1.default.equal((0, clickup_csv_util_1.coerceCustomValue)('dropdown', 'North'), 'North');
    });
    (0, node_test_1.it)('returns null for empty cells', () => {
        strict_1.default.equal((0, clickup_csv_util_1.coerceCustomValue)('text', '   '), null);
    });
});
(0, node_test_1.describe)('buildDropdownOptions + dupKey + mappers', () => {
    (0, node_test_1.it)('de-dupes options case-insensitively (first casing wins)', () => {
        strict_1.default.deepEqual((0, clickup_csv_util_1.buildDropdownOptions)(['High', 'low', 'high', 'Low']), [
            { label: 'High', value: 'High' },
            { label: 'low', value: 'low' },
        ]);
    });
    (0, node_test_1.it)('dupKey is list+title, case/space-insensitive', () => {
        strict_1.default.equal((0, clickup_csv_util_1.dupKey)('Sprint 1', 'Design Homepage'), (0, clickup_csv_util_1.dupKey)(' sprint 1 ', ' design homepage '));
        strict_1.default.notEqual((0, clickup_csv_util_1.dupKey)('Sprint 1', 'Design'), (0, clickup_csv_util_1.dupKey)('Sprint 2', 'Design'));
    });
    (0, node_test_1.it)('maps ClickUp status/priority', () => {
        strict_1.default.equal((0, clickup_csv_util_1.mapStatus)('Complete'), 'done');
        strict_1.default.equal((0, clickup_csv_util_1.mapStatus)('in progress'), 'in_progress');
        strict_1.default.equal((0, clickup_csv_util_1.mapPriority)('Urgent'), 'urgent');
        strict_1.default.equal((0, clickup_csv_util_1.mapPriority)('2'), 'high');
    });
});
//# sourceMappingURL=clickup-csv.util.test.js.map