declare const PRIORITIES: readonly ["urgent", "high", "normal", "low"];
export declare class CreateTaskDto {
    listId: string;
    title: string;
    description?: string;
    priority?: (typeof PRIORITIES)[number];
    status?: string;
    position?: number;
    startDate?: string;
    dueDate?: string;
    timeEstimate?: number;
    parentTaskId?: string;
    /**
     * §1.1 — "yahan pe humein woh option hi nahi deta ke hum task type ko select
     * kar sakein". tasks.service.ts has taken a taskTypeId since task types
     * shipped, but the pipe runs with `whitelist: true`, so a client sending one
     * had it silently stripped before the service ever saw it: the create path
     * could only ever produce the list's default type.
     */
    taskTypeId?: string;
    assigneeIds?: string[];
    labelIds?: string[];
}
/**
 * Add-attachment body. Previously an untyped `@Body() any`, which let a caller
 * send an arbitrary `storageKey` that the service stored/served verbatim — a
 * cross-tenant object-reference risk. Declaring the shape (with the global
 * `whitelist` ValidationPipe) drops unknown fields; the service additionally
 * enforces that a client `storageKey` sits under this task's own R2 prefix.
 */
export declare class AddAttachmentDto {
    fileName: string;
    url?: string;
    storageKey?: string;
    contentType?: string;
    sizeBytes?: number;
}
export {};
