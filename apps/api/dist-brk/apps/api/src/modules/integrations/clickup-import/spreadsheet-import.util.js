"use strict";
/**
 * §V2-S13 frame `12:08` — the **Imports** submenu.
 *
 * The frame draws twelve rows under Create › Imports ›:
 *
 *     Spreadsheet files · Document files
 *     Asana · Basecamp · Confluence · Jira Software · Monday · Notion ·
 *     Slack · Todoist · Trello · Wrike
 *
 * Rundesk shipped exactly one importer: a ClickUp CSV reader (plus an optional
 * ClickUp API token for comments/attachments, which is beyond the frames).
 *
 * TEN TILES THAT OPEN A DIALOG THAT CANNOT IMPORT IS THE FACADE DEFECT AT TEN
 * TIMES SCALE. So this file builds ONE real thing — a generic delimited-text
 * importer with an explicit, user-editable column mapping — and then carries
 * per-source **column presets** for the named tools that genuinely publish a
 * task-shaped CSV. A preset is not a separate importer; it is the starting
 * mapping for the same parser, which is why it can be honest.
 *
 * The four sources with no preset are NOT drawn as controls anywhere. They are
 * listed once, as text, with the reason — see `UNSUPPORTED_SOURCES`. Absent
 * beats fake.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LIST_NAME = exports.MAX_TITLE = exports.mapStatus = exports.DEFAULT_STATUSES = exports.sourceByKey = exports.UNSUPPORTED_SOURCES = exports.SHEET_SOURCES = exports.SHEET_FIELDS = void 0;
exports.detectDelimiter = detectDelimiter;
exports.splitDelimitedRow = splitDelimitedRow;
exports.parseSheet = parseSheet;
exports.autoMap = autoMap;
exports.statusCategoryOf = statusCategoryOf;
exports.normalizePriority = normalizePriority;
exports.splitCell = splitCell;
exports.mapRow = mapRow;
exports.mapSheet = mapSheet;
exports.mappingError = mappingError;
const clickup_csv_util_1 = require("./clickup-csv.util");
Object.defineProperty(exports, "mapStatus", { enumerable: true, get: function () { return clickup_csv_util_1.mapStatus; } });
/** Every field the mapper offers, in the order the UI draws them. ONE list. */
exports.SHEET_FIELDS = [
    'title',
    'description',
    'status',
    'priority',
    'dueDate',
    'startDate',
    'assignees',
    'list',
    'tags',
    'ignore',
];
/**
 * The named sources whose export is a task-shaped delimited file. Each one is
 * a mapping over the SAME parser — nothing here is a separate code path, which
 * is the only reason seven names can be honest at once.
 *
 * Header spellings are the ones the product's own export writes. Unknown
 * headers are not an error: they simply start on `ignore` and the person can
 * map them by hand.
 */
exports.SHEET_SOURCES = [
    {
        key: 'generic',
        label: 'Spreadsheet files',
        priorityScale: 'clickup',
        exportHint: 'Any CSV or TSV with a header row. Map the columns yourself.',
        columns: {
            title: 'title',
            name: 'title',
            task: 'title',
            'task name': 'title',
            description: 'description',
            notes: 'description',
            status: 'status',
            priority: 'priority',
            'due date': 'dueDate',
            due: 'dueDate',
            'start date': 'startDate',
            assignee: 'assignees',
            assignees: 'assignees',
            owner: 'assignees',
            list: 'list',
            section: 'list',
            tags: 'tags',
            labels: 'tags',
        },
    },
    {
        key: 'asana',
        label: 'Asana',
        priorityScale: 'text',
        exportHint: 'Asana › Project ▾ › Export/Print › CSV.',
        columns: {
            name: 'title',
            notes: 'description',
            'assignee email': 'assignees',
            assignee: 'assignees',
            'due date': 'dueDate',
            'start date': 'startDate',
            'section/column': 'list',
            tags: 'tags',
            priority: 'priority',
        },
    },
    {
        key: 'jira',
        label: 'Jira Software',
        priorityScale: 'text',
        exportHint: 'Jira › Issue search › Export ▾ › CSV (all fields).',
        columns: {
            summary: 'title',
            description: 'description',
            status: 'status',
            priority: 'priority',
            'due date': 'dueDate',
            duedate: 'dueDate',
            assignee: 'assignees',
            'project name': 'list',
        },
    },
    {
        key: 'monday',
        label: 'Monday',
        priorityScale: 'text',
        exportHint: 'monday.com › Board menu › Export board to Excel, then save as CSV.',
        columns: {
            name: 'title',
            notes: 'description',
            person: 'assignees',
            owner: 'assignees',
            status: 'status',
            date: 'dueDate',
            'due date': 'dueDate',
            timeline: 'ignore',
            priority: 'priority',
            group: 'list',
        },
    },
    {
        key: 'notion',
        label: 'Notion',
        priorityScale: 'text',
        exportHint: 'Notion › database ••• › Export › Markdown & CSV.',
        columns: {
            name: 'title',
            description: 'description',
            status: 'status',
            assignee: 'assignees',
            'assigned to': 'assignees',
            due: 'dueDate',
            'due date': 'dueDate',
            priority: 'priority',
            tags: 'tags',
        },
    },
    {
        key: 'todoist',
        label: 'Todoist',
        // Todoist's CSV writes 4 for p1 and 1 for p4 — the inverse of ClickUp's.
        priorityScale: 'todoist',
        exportHint: 'Todoist › project ••• › Export › Export as a template (CSV).',
        columns: {
            content: 'title',
            description: 'description',
            priority: 'priority',
            responsible: 'assignees',
            date: 'dueDate',
            type: 'ignore',
            indent: 'ignore',
            author: 'ignore',
        },
    },
    {
        key: 'trello',
        label: 'Trello',
        priorityScale: 'text',
        exportHint: 'Trello › Board menu › Print, export and share › Export as CSV.',
        columns: {
            'card name': 'title',
            'card description': 'description',
            'due date': 'dueDate',
            members: 'assignees',
            labels: 'tags',
            'list name': 'list',
            'board name': 'ignore',
            'card url': 'ignore',
        },
    },
    {
        key: 'wrike',
        label: 'Wrike',
        priorityScale: 'text',
        exportHint: 'Wrike › folder ▾ › Export to Excel, then save as CSV.',
        columns: {
            title: 'title',
            description: 'description',
            status: 'status',
            'assigned to': 'assignees',
            'start date': 'startDate',
            'due date': 'dueDate',
            'finish date': 'dueDate',
            priority: 'priority',
        },
    },
];
/**
 * The frame's remaining rows, recorded as DECISIONS rather than quietly
 * dropped — and deliberately not rendered as anything clickable.
 *
 * Re-check these before trusting them (a reason that stopped being true is its
 * own defect class). Each one is "there is no task-shaped export to parse",
 * not "we ran out of time".
 */
exports.UNSUPPORTED_SOURCES = [
    {
        key: 'basecamp',
        label: 'Basecamp',
        reason: 'Basecamp has no built-in export of to-dos; reading them needs the Basecamp API and an OAuth app, which is a different build from a file importer.',
    },
    {
        key: 'confluence',
        label: 'Confluence',
        reason: 'Confluence exports pages as HTML/XML/PDF, not task rows. Importing it means a document importer writing Docs, not tasks.',
    },
    {
        key: 'slack',
        label: 'Slack',
        reason: 'A Slack export is conversation JSON. There are no task rows in it to map.',
    },
    {
        key: 'documents',
        label: 'Document files',
        reason: 'Document import writes Rundesk Docs, not tasks. No document parser is built, so no control is drawn for it.',
    },
];
const sourceByKey = (key) => exports.SHEET_SOURCES.find((s) => s.key === key) ?? exports.SHEET_SOURCES[0];
exports.sourceByKey = sourceByKey;
// ── parsing ──────────────────────────────────────────────────────────────────
const DELIMITERS = [',', '\t', ';', '|'];
/**
 * Pick the delimiter from the header line: the candidate that appears most
 * often OUTSIDE quotes. A comma-quoted TSV header ("a,b"\tc) is why the count
 * has to respect quoting rather than just counting characters.
 */
function detectDelimiter(text) {
    const [header = ''] = (0, clickup_csv_util_1.splitCsvLines)(text);
    let best = ',';
    let bestCount = 0;
    for (const d of DELIMITERS) {
        let count = 0;
        let inQuote = false;
        for (let i = 0; i < header.length; i++) {
            const ch = header[i];
            if (ch === '"') {
                if (inQuote && header[i + 1] === '"') {
                    i++;
                    continue;
                }
                inQuote = !inQuote;
                continue;
            }
            if (ch === d && !inQuote)
                count++;
        }
        if (count > bestCount) {
            best = d;
            bestCount = count;
        }
    }
    return best;
}
/**
 * Split one row on `delim`, honouring quotes and doubled quotes. The
 * delimiter-aware generalisation of `splitCsvRow` in `clickup-csv.util.ts`
 * (which is comma-only and stays that way so the ClickUp path is untouched).
 */
function splitDelimitedRow(line, delim) {
    const fields = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuote && line[i + 1] === '"') {
                current += '"';
                i++;
                continue;
            }
            inQuote = !inQuote;
            continue;
        }
        if (ch === delim && !inQuote) {
            fields.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    fields.push(current);
    return fields;
}
/** Split a delimited file into a header row plus numbered data rows. */
function parseSheet(text, delimiter) {
    const delim = delimiter ?? detectDelimiter(text);
    const lines = (0, clickup_csv_util_1.splitCsvLines)(text ?? '');
    if (lines.length === 0)
        return { headers: [], delimiter: delim, rows: [] };
    const headers = splitDelimitedRow(lines[0], delim).map((h) => h.trim());
    const rows = lines.slice(1).map((line, i) => ({
        // +2: line 1 is the header, and `i` is 0-based within the remainder.
        line: i + 2,
        cells: splitDelimitedRow(line, delim),
    }));
    return { headers, delimiter: delim, rows };
}
/**
 * Starting mapping for a set of headers under a preset. Falls back to the
 * generic preset for any header the named source does not know, so a Trello
 * export with an extra "Story points" column still maps the six it does know.
 */
function autoMap(headers, sourceKey) {
    const source = (0, exports.sourceByKey)(sourceKey);
    const generic = exports.SHEET_SOURCES[0];
    const mapping = {};
    let titleTaken = false;
    for (const h of headers) {
        const key = h.trim().toLowerCase();
        const field = source.columns[key] ?? (source.key === 'generic' ? undefined : generic.columns[key]) ?? 'ignore';
        // Exactly one column may be the title; a second "Name" stays unmapped
        // rather than silently overwriting the first.
        if (field === 'title') {
            mapping[h] = titleTaken ? 'ignore' : 'title';
            titleTaken = true;
            continue;
        }
        mapping[h] = field;
    }
    return mapping;
}
// ── value mapping ────────────────────────────────────────────────────────────
/**
 * Status buckets for the six default list statuses. This MIRRORS
 * `DEFAULT_LIST_STATUSES` in `apps/api/src/modules/lists/lists.service.ts`,
 * which is not exported; the importer seeds its own lists from this constant,
 * so the pipeline it creates and the category it stamps cannot disagree with
 * each other. `spreadsheet-import.util.test.ts` pins the six pairs.
 */
exports.DEFAULT_STATUSES = [
    { key: 'backlog', name: 'Backlog', color: '#94a3b8', category: 'open', position: 0 },
    { key: 'todo', name: 'To do', color: '#64748b', category: 'open', position: 1 },
    { key: 'in_progress', name: 'In progress', color: '#3b82f6', category: 'in_progress', position: 2 },
    { key: 'in_review', name: 'In review', color: '#a855f7', category: 'in_progress', position: 3 },
    { key: 'done', name: 'Done', color: '#10b981', category: 'closed', position: 4 },
    { key: 'cancelled', name: 'Cancelled', color: '#f43f5e', category: 'closed', position: 5 },
];
/**
 * The bucket a status key belongs to. `tasks.status_category` is what every
 * rollup, the Closed toggle and the progress ring read — the ClickUp importer
 * never sets it, so an imported "Done" task counts as open everywhere. This is
 * the reader that stops that happening here.
 */
function statusCategoryOf(status) {
    return exports.DEFAULT_STATUSES.find((s) => s.key === status)?.category ?? 'open';
}
/** Extra words the general ClickUp mapper does not know (Jira, Wrike, Monday). */
const URGENT_WORDS = ['urgent', 'highest', 'critical', 'blocker', 'immediate'];
const LOW_WORDS = ['lowest', 'minor', 'trivial', 'deferred'];
/**
 * Normalise a priority cell. Delegates the common vocabulary to
 * `mapPriority` (clickup-csv.util) so the two cannot drift; only the tokens
 * that mapper cannot express are handled here.
 */
function normalizePriority(raw, scale) {
    const v = (raw ?? '').trim().toLowerCase();
    if (!v)
        return 'normal';
    if (/^[0-9]+$/.test(v)) {
        const n = Number(v);
        if (scale === 'text')
            return 'normal';
        if (scale === 'todoist') {
            // Todoist CSV: 4 = p1 (urgent) … 1 = p4 (low).
            if (n >= 4)
                return 'urgent';
            if (n === 3)
                return 'high';
            if (n === 2)
                return 'normal';
            return 'low';
        }
        return (0, clickup_csv_util_1.mapPriority)(v); // clickup: 1 urgent, 2 high, 4 low
    }
    if (URGENT_WORDS.some((w) => v.includes(w)))
        return 'urgent';
    // "lowest"/"minor" must beat mapPriority's substring rules, which would read
    // "highest" as high and never see "lowest" at all.
    if (LOW_WORDS.some((w) => v.includes(w)))
        return 'low';
    return (0, clickup_csv_util_1.mapPriority)(v);
}
exports.MAX_TITLE = 500;
exports.DEFAULT_LIST_NAME = 'Imported Tasks';
/** Multi-value cell → trimmed parts. Commas, semicolons and newlines. */
function splitCell(value) {
    if (!value)
        return [];
    return value.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
}
/**
 * Turn one parsed line into a task, or say why it cannot become one.
 *
 * Every rejection carries the FILE LINE NUMBER and the offending column, so
 * "row 7: due date “tomorrow?” is not a date" is something a person can go and
 * fix. A row that is rejected is never written — half-importing it and
 * reporting success is the failure this whole audit is about.
 */
function mapRow(entry, headers, mapping, opts) {
    const { line, cells } = entry;
    if (cells.length > headers.length) {
        return {
            ok: false,
            rejection: {
                row: line,
                code: 'ragged_row',
                message: `Row ${line}: ${cells.length} values for ${headers.length} columns — the row is misquoted or has a stray delimiter.`,
                value: String(cells.length),
            },
        };
    }
    const pick = (field) => {
        for (let i = 0; i < headers.length; i++) {
            if (mapping[headers[i]] === field) {
                return { header: headers[i], value: (cells[i] ?? '').trim() };
            }
        }
        return undefined;
    };
    const titleCell = pick('title');
    const title = titleCell?.value ?? '';
    if (!title) {
        return {
            ok: false,
            rejection: {
                row: line,
                code: 'title_missing',
                column: titleCell?.header,
                message: `Row ${line}: no task name — the column mapped to Title is empty.`,
            },
        };
    }
    if (title.length > exports.MAX_TITLE) {
        return {
            ok: false,
            rejection: {
                row: line,
                code: 'title_too_long',
                column: titleCell?.header,
                value: String(title.length),
                message: `Row ${line}: the task name is ${title.length} characters — the limit is ${exports.MAX_TITLE}.`,
            },
        };
    }
    const readDate = (field) => {
        const cell = pick(field);
        if (!cell || !cell.value)
            return { ok: true };
        const ms = Date.parse(cell.value);
        if (Number.isNaN(ms)) {
            return {
                ok: false,
                rejection: {
                    row: line,
                    code: 'invalid_date',
                    column: cell.header,
                    value: cell.value,
                    message: `Row ${line}: "${cell.value}" in ${cell.header} is not a date.`,
                },
            };
        }
        return { ok: true, date: new Date(ms) };
    };
    const due = readDate('dueDate');
    if (!due.ok)
        return { ok: false, rejection: due.rejection };
    const start = readDate('startDate');
    if (!start.ok)
        return { ok: false, rejection: start.rejection };
    const status = (0, clickup_csv_util_1.mapStatus)(pick('status')?.value);
    return {
        ok: true,
        row: {
            row: line,
            title,
            description: pick('description')?.value || undefined,
            status,
            statusCategory: statusCategoryOf(status),
            priority: normalizePriority(pick('priority')?.value, opts.priorityScale),
            dueDate: due.date,
            startDate: start.date,
            assignees: splitCell(pick('assignees')?.value),
            listName: pick('list')?.value || opts.defaultListName || exports.DEFAULT_LIST_NAME,
            tags: splitCell(pick('tags')?.value),
        },
    };
}
/** Map every row, keeping the accepted ones and the rejections side by side. */
function mapSheet(table, mapping, opts) {
    const rows = [];
    const rejections = [];
    for (const entry of table.rows) {
        // A wholly blank line is not a rejection; it is nothing.
        if (entry.cells.every((c) => c.trim() === ''))
            continue;
        const res = mapRow(entry, table.headers, mapping, opts);
        if (res.ok)
            rows.push(res.row);
        else
            rejections.push(res.rejection);
    }
    return { rows, rejections };
}
/** A mapping can only be run when exactly one column feeds the title. */
function mappingError(mapping) {
    const titles = Object.values(mapping).filter((f) => f === 'title').length;
    if (titles === 0)
        return 'Map one column to Title — a task without a name cannot be created.';
    if (titles > 1)
        return `Map exactly one column to Title (${titles} are mapped).`;
    return null;
}
//# sourceMappingURL=spreadsheet-import.util.js.map