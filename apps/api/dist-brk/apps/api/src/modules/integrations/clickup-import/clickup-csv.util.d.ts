/**
 * Pure ClickUp-CSV helpers (no DB). Kept separate from the service so the
 * parsing, custom-field detection, type inference, and duplicate-key logic are
 * unit-testable in isolation (Plan §12.5).
 */
export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
/** Rundesk custom-field types we can infer from a ClickUp CSV column. */
export type InferredFieldType = 'text' | 'number' | 'dropdown' | 'date' | 'checkbox';
export type ParsedTask = {
    taskId?: string;
    parentId?: string;
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    dueDate?: string;
    list?: string;
    folder?: string;
    assignees?: string;
    tags?: string;
    /** Raw custom-field cells keyed by the original-case column header. */
    custom: Record<string, string>;
};
export type CustomFieldColumn = {
    /** Header as shown in the CSV (original case) — used as the field name. */
    name: string;
    type: InferredFieldType;
    /** Present only for `type === 'dropdown'`. */
    options?: Array<{
        label: string;
        value: string;
    }>;
};
export type ParsedCsv = {
    rows: ParsedTask[];
    headers: string[];
    customFieldColumns: CustomFieldColumn[];
};
/** Split a ClickUp multi-value cell (comma / newline / semicolon separated). */
export declare function splitList(value?: string): string[];
/** Duplicate key: a task is "the same" within a list when its title matches. */
export declare function dupKey(listName: string, title: string): string;
export declare function mapStatus(value?: string): TaskStatus;
export declare function mapPriority(value?: string): TaskPriority;
export declare function safeDate(value: string): Date | undefined;
/**
 * Infer a Rundesk custom-field type from the observed column values.
 * Order: checkbox → number → date → dropdown → text (default).
 */
export declare function inferCustomFieldType(values: string[]): CustomFieldColumn['type'];
/** Build de-duplicated dropdown options (first-seen casing wins). */
export declare function buildDropdownOptions(values: string[]): Array<{
    label: string;
    value: string;
}>;
/**
 * Coerce a raw CSV cell into the stored value shape for a given field type.
 * Returns null when the cell can't be represented (skip the value, not an error).
 */
export declare function coerceCustomValue(type: InferredFieldType, raw: string): string | number | boolean | null;
/** Split CSV text into logical rows, respecting quoted newlines. */
export declare function splitCsvLines(csv: string): string[];
/** Split a single CSV row into fields, respecting quotes. */
export declare function splitCsvRow(line: string): string[];
/**
 * Parse a ClickUp CSV export into task rows plus the detected custom-field
 * columns (with inferred types + dropdown options). Columns beyond the known
 * task/built-in fields become custom fields.
 */
export declare function parseClickUpCsv(csv: string): ParsedCsv;
