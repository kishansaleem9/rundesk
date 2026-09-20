import { ViewsService } from './views.service';
import { ListFiltersService } from './list-filters.service';
import type { CurrentUserPayload } from '../tasks/types';
import type { ViewVisibility } from '@rundesk/db';
/**
 * §V2-07 — saved views.
 *
 * `ResourceMemberGuard` says you are a member of the workspace this view's list
 * belongs to. That was the ONLY check here until now, which meant any member
 * could rename, re-default or delete any view on any list they could open,
 * including someone else's. The second check — who may see it, who may change
 * it — is in the service, because it needs the row.
 */
export declare class ViewsController {
    private views;
    private filters;
    constructor(views: ViewsService, filters: ListFiltersService);
    list(listId: string, user: CurrentUserPayload): Promise<{
        id: string;
        listId: string;
        createdById: string | null;
        name: string;
        type: "list" | "board" | "calendar" | "gantt" | "table" | "team";
        isDefault: boolean;
        isPinned: boolean;
        visibility: ViewVisibility;
        position: number;
        config: Record<string, unknown>;
        createdAt: Date;
        updatedAt: Date;
        autosave: boolean;
    }[]>;
    /** "Copy link to view" lands here — one view, by id, or a 404. */
    getOne(viewId: string, user: CurrentUserPayload): Promise<{
        id: string;
        listId: string;
        createdById: string | null;
        name: string;
        type: "list" | "board" | "calendar" | "gantt" | "table" | "team";
        isDefault: boolean;
        isPinned: boolean;
        visibility: ViewVisibility;
        position: number;
        config: Record<string, unknown>;
        createdAt: Date;
        updatedAt: Date;
    }>;
    create(listId: string, user: CurrentUserPayload, body: {
        name: string;
        type: 'list' | 'board' | 'calendar' | 'gantt' | 'table';
        config?: Record<string, unknown>;
        visibility?: ViewVisibility;
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        visibility: ViewVisibility;
        position: number;
        listId: string;
        isDefault: boolean;
        type: "list" | "board" | "calendar" | "gantt" | "table" | "team";
        isPinned: boolean;
        config: Record<string, unknown>;
    }>;
    update(viewId: string, user: CurrentUserPayload, body: {
        name?: string;
        config?: Record<string, unknown>;
        position?: number;
        isDefault?: boolean;
        isPinned?: boolean;
        visibility?: ViewVisibility;
    }): Promise<{
        id: string;
        listId: string;
        createdById: string | null;
        name: string;
        type: "list" | "board" | "calendar" | "gantt" | "table" | "team";
        isDefault: boolean;
        isPinned: boolean;
        visibility: ViewVisibility;
        position: number;
        config: Record<string, unknown>;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /** "Autosave for me" — your own flag on someone else's view is still yours. */
    autosave(viewId: string, user: CurrentUserPayload, body: {
        autosave?: boolean;
    }): Promise<{
        viewId: string;
        autosave: boolean;
    }>;
    remove(viewId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    listFilters(listId: string, user: CurrentUserPayload): Omit<import("drizzle-orm/pg-core").PgSelectBase<"list_filter_presets", {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "list_filter_presets";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        listId: import("drizzle-orm/pg-core").PgColumn<{
            name: "list_id";
            tableName: "list_filter_presets";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "list_filter_presets";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        name: import("drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "list_filter_presets";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        rules: import("drizzle-orm/pg-core").PgColumn<{
            name: "rules";
            tableName: "list_filter_presets";
            dataType: "json";
            columnType: "PgJsonb";
            data: unknown[];
            driverParam: unknown;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: unknown[];
        }>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "list_filter_presets";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "list_filter_presets";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    }, "single", Record<"list_filter_presets", "not-null">, false, "where" | "orderBy", {
        id: string;
        listId: string;
        userId: string;
        name: string;
        rules: unknown[];
        createdAt: Date;
        updatedAt: Date;
    }[], {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "list_filter_presets";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        listId: import("drizzle-orm/pg-core").PgColumn<{
            name: "list_id";
            tableName: "list_filter_presets";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "list_filter_presets";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        name: import("drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "list_filter_presets";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        rules: import("drizzle-orm/pg-core").PgColumn<{
            name: "rules";
            tableName: "list_filter_presets";
            dataType: "json";
            columnType: "PgJsonb";
            data: unknown[];
            driverParam: unknown;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: unknown[];
        }>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "list_filter_presets";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "list_filter_presets";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    }>, "where" | "orderBy">;
    saveFilter(listId: string, user: CurrentUserPayload, body: {
        name: string;
        rules?: unknown;
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        listId: string;
        rules: unknown[];
    }>;
    deleteFilter(filterId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
}
