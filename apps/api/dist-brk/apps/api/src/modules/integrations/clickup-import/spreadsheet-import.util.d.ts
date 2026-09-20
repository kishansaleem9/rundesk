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
import { mapStatus, type TaskPriority, type TaskStatus } from './clickup-csv.util';
/** Which Rundesk task field a spreadsheet column feeds. `ignore` = not imported. */
export type SheetField = 'title' | 'description' | 'status' | 'priority' | 'dueDate' | 'startDate' | 'assignees' | 'list' | 'tags' | 'ignore';
/** Every field the mapper offers, in the order the UI draws them. ONE list. */
export declare const SHEET_FIELDS: readonly SheetField[];
/** header (as written in the file) → field. */
export type ColumnMapping = Record<string, SheetField>;
export type SheetDelimiter = ',' | '\t' | ';' | '|';
/**
 * How a source spells numeric priorities.
 *  - `clickup`  1 = urgent … 4 = low (also ClickUp, Asana numeric exports)
 *  - `todoist`  4 = urgent … 1 = low — Todoist's CSV inverts the UI's p1..p4
 *  - `text`     no numeric meaning; only words are honoured
 */
export type PriorityScale = 'clickup' | 'todoist' | 'text';
export type SheetSource = {
    key: string;
    /** How the frame spells it, so the UI and the audit can be compared directly. */
    label: string;
    /** Lower-cased source header → field. */
    columns: Record<string, SheetField>;
    priorityScale: PriorityScale;
    /** Where the export comes from, shown under the picker so it is actionable. */
    exportHint: string;
};
/**
 * The named sources whose export is a task-shaped delimited file. Each one is
 * a mapping over the SAME parser — nothing here is a separate code path, which
 * is the only reason seven names can be honest at once.
 *
 * Header spellings are the ones the product's own export writes. Unknown
 * headers are not an error: they simply start on `ignore` and the person can
 * map them by hand.
 */
export declare const SHEET_SOURCES: readonly SheetSource[];
/**
 * The frame's remaining rows, recorded as DECISIONS rather than quietly
 * dropped — and deliberately not rendered as anything clickable.
 *
 * Re-check these before trusting them (a reason that stopped being true is its
 * own defect class). Each one is "there is no task-shaped export to parse",
 * not "we ran out of time".
 */
export declare const UNSUPPORTED_SOURCES: ReadonlyArray<{
    key: string;
    label: string;
    reason: string;
}>;
export declare const sourceByKey: (key?: string) => SheetSource;
/**
 * Pick the delimiter from the header line: the candidate that appears most
 * often OUTSIDE quotes. A comma-quoted TSV header ("a,b"\tc) is why the count
 * has to respect quoting rather than just counting characters.
 */
export declare function detectDelimiter(text: string): SheetDelimiter;
/**
 * Split one row on `delim`, honouring quotes and doubled quotes. The
 * delimiter-aware generalisation of `splitCsvRow` in `clickup-csv.util.ts`
 * (which is comma-only and stays that way so the ClickUp path is untouched).
 */
export declare function splitDelimitedRow(line: string, delim: SheetDelimiter): string[];
export type SheetTable = {
    headers: string[];
    delimiter: SheetDelimiter;
    /** One entry per data row: its cells, and the 1-based LINE number in the file. */
    rows: Array<{
        line: number;
        cells: string[];
    }>;
};
/** Split a delimited file into a header row plus numbered data rows. */
export declare function parseSheet(text: string, delimiter?: SheetDelimiter): SheetTable;
/**
 * Starting mapping for a set of headers under a preset. Falls back to the
 * generic preset for any header the named source does not know, so a Trello
 * export with an extra "Story points" column still maps the six it does know.
 */
export declare function autoMap(headers: string[], sourceKey?: string): ColumnMapping;
/**
 * Status buckets for the six default list statuses. This MIRRORS
 * `DEFAULT_LIST_STATUSES` in `apps/api/src/modules/lists/lists.service.ts`,
 * which is not exported; the importer seeds its own lists from this constant,
 * so the pipeline it creates and the category it stamps cannot disagree with
 * each other. `spreadsheet-import.util.test.ts` pins the six pairs.
 */
export declare const DEFAULT_STATUSES: readonly [{
    readonly key: "backlog";
    readonly name: "Backlog";
    readonly color: "#94a3b8";
    readonly category: "open";
    readonly position: 0;
}, {
    readonly key: "todo";
    readonly name: "To do";
    readonly color: "#64748b";
    readonly category: "open";
    readonly position: 1;
}, {
    readonly key: "in_progress";
    readonly name: "In progress";
    readonly color: "#3b82f6";
    readonly category: "in_progress";
    readonly position: 2;
}, {
    readonly key: "in_review";
    readonly name: "In review";
    readonly color: "#a855f7";
    readonly category: "in_progress";
    readonly position: 3;
}, {
    readonly key: "done";
    readonly name: "Done";
    readonly color: "#10b981";
    readonly category: "closed";
    readonly position: 4;
}, {
    readonly key: "cancelled";
    readonly name: "Cancelled";
    readonly color: "#f43f5e";
    readonly category: "closed";
    readonly position: 5;
}];
export type StatusCategory = 'open' | 'in_progress' | 'closed';
/**
 * The bucket a status key belongs to. `tasks.status_category` is what every
 * rollup, the Closed toggle and the progress ring read — the ClickUp importer
 * never sets it, so an imported "Done" task counts as open everywhere. This is
 * the reader that stops that happening here.
 */
export declare function statusCategoryOf(status: TaskStatus): StatusCategory;
/**
 * Normalise a priority cell. Delegates the common vocabulary to
 * `mapPriority` (clickup-csv.util) so the two cannot drift; only the tokens
 * that mapper cannot express are handled here.
 */
export declare function normalizePriority(raw: string | undefined, scale: PriorityScale): TaskPriority;
export { mapStatus };
export type RejectCode = 'title_missing' | 'title_too_long' | 'invalid_date' | 'ragged_row';
export type RowRejection = {
    /** 1-based line number in the uploaded file (line 1 is the header). */
    row: number;
    code: RejectCode;
    /** Human sentence naming the row and what was wrong with it. */
    message: string;
    column?: string;
    value?: string;
};
export type MappedRow = {
    row: number;
    title: string;
    description?: string;
    status: TaskStatus;
    statusCategory: StatusCategory;
    priority: TaskPriority;
    dueDate?: Date;
    startDate?: Date;
    assignees: string[];
    listName: string;
    tags: string[];
};
export declare const MAX_TITLE = 500;
export declare const DEFAULT_LIST_NAME = "Imported Tasks";
/** Multi-value cell → trimmed parts. Commas, semicolons and newlines. */
export declare function splitCell(value?: string): string[];
/**
 * Turn one parsed line into a task, or say why it cannot become one.
 *
 * Every rejection carries the FILE LINE NUMBER and the offending column, so
 * "row 7: due date “tomorrow?” is not a date" is something a person can go and
 * fix. A row that is rejected is never written — half-importing it and
 * reporting success is the failure this whole audit is about.
 */
export declare function mapRow(entry: {
    line: number;
    cells: string[];
}, headers: string[], mapping: ColumnMapping, opts: {
    priorityScale: PriorityScale;
    defaultListName?: string;
}): {
    ok: true;
    row: MappedRow;
} | {
    ok: false;
    rejection: RowRejection;
};
/** Map every row, keeping the accepted ones and the rejections side by side. */
export declare function mapSheet(table: SheetTable, mapping: ColumnMapping, opts: {
    priorityScale: PriorityScale;
    defaultListName?: string;
}): {
    rows: MappedRow[];
    rejections: RowRejection[];
};
/** A mapping can only be run when exactly one column feeds the title. */
export declare function mappingError(mapping: ColumnMapping): string | null;
