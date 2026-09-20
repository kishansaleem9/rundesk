import { type RawBodyRequest } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { InboundWebhooksService } from './inbound-webhooks.service';
import { GitCommitLinksService } from './git-commit-links.service';
import { ZoomRecordingsService } from './zoom-recordings.service';
import type { CurrentUserPayload } from '../tasks/types';
export declare class InboundWebhooksController {
    private readonly hooks;
    constructor(hooks: InboundWebhooksService);
    list(listId: string): Omit<import("drizzle-orm/pg-core").PgSelectBase<"inbound_webhooks", {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "inbound_webhooks";
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
            tableName: "inbound_webhooks";
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
        token: import("drizzle-orm/pg-core").PgColumn<{
            name: "token";
            tableName: "inbound_webhooks";
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
        name: import("drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "inbound_webhooks";
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
        isEnabled: import("drizzle-orm/pg-core").PgColumn<{
            name: "is_enabled";
            tableName: "inbound_webhooks";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
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
        createdById: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_by_id";
            tableName: "inbound_webhooks";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "inbound_webhooks";
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
    }, "single", Record<"inbound_webhooks", "not-null">, false, "where" | "orderBy", {
        id: string;
        listId: string;
        token: string;
        name: string;
        isEnabled: boolean;
        createdById: string | null;
        createdAt: Date;
    }[], {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "inbound_webhooks";
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
            tableName: "inbound_webhooks";
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
        token: import("drizzle-orm/pg-core").PgColumn<{
            name: "token";
            tableName: "inbound_webhooks";
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
        name: import("drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "inbound_webhooks";
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
        isEnabled: import("drizzle-orm/pg-core").PgColumn<{
            name: "is_enabled";
            tableName: "inbound_webhooks";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
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
        createdById: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_by_id";
            tableName: "inbound_webhooks";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "inbound_webhooks";
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
    create(listId: string, user: CurrentUserPayload, body: {
        name?: string;
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        createdById: string | null;
        listId: string;
        token: string;
        isEnabled: boolean;
    }>;
    remove(listId: string, id: string): Promise<{
        ok: boolean;
    }>;
}
export declare class InboundWebhookReceiverController {
    private readonly hooks;
    constructor(hooks: InboundWebhooksService);
    receive(token: string, body: {
        title?: string;
        description?: string;
        priority?: string;
        dueDate?: string;
    }): Promise<{
        ok: boolean;
        taskId: string | undefined;
    }>;
}
/**
 * §12.8 — public GitHub/GitLab **push** receiver. External VCS hosts POST push
 * events here; each commit message is scanned for a Rundesk task reference
 * (see git-commit-links.util) and auto-linked to the task (kind:'commit').
 *
 * Signature/secret verification (env-gated, degrades to permissive when the
 * secret env var is unset — matching the existing inbound-email receiver):
 *   • GitHub → HMAC-SHA256 of the RAW body under `GITHUB_WEBHOOK_SECRET`,
 *     compared to `X-Hub-Signature-256`.
 *   • GitLab → the `X-Gitlab-Token` header compared to `GITLAB_WEBHOOK_SECRET`.
 * The raw body is available because the app is bootstrapped with
 * `{ rawBody: true }` (see main.ts — the same mechanism the Stripe webhook uses).
 */
export declare class InboundGitWebhookController {
    private readonly commitLinks;
    constructor(commitLinks: GitCommitLinksService);
    receive(providerRaw: string, req: RawBodyRequest<FastifyRequest>, githubSignature: string | undefined, gitlabToken: string | undefined, githubEvent: string | undefined, gitlabEvent: string | undefined, body: unknown): Promise<import("./git-commit-links.service").PushIngestSummary | {
        ok: boolean;
        event: string;
        linked: number;
    }>;
    private assertGitProvider;
    private verifyGithubSignature;
    private verifyGitlabToken;
}
/**
 * §12.9 — public Zoom event receiver. Handles the one-time `endpoint.url_validation`
 * challenge and the `recording.completed` event: on the latter we fetch the
 * meeting's cloud recording and attach its share URL to the linked task(s).
 *
 * Signature verification (env-gated on `ZOOM_WEBHOOK_SECRET_TOKEN`): Zoom signs
 * `v0:<timestamp>:<raw body>` with HMAC-SHA256 and sends it as `x-zm-signature`.
 */
export declare class InboundZoomWebhookController {
    private readonly recordings;
    constructor(recordings: ZoomRecordingsService);
    receive(req: RawBodyRequest<FastifyRequest>, signature: string | undefined, timestamp: string | undefined, body: {
        event?: string;
        payload?: {
            plainToken?: string;
        };
    }): Promise<import("./zoom-recordings.service").RecordingAttachSummary | {
        plainToken: string;
        encryptedToken: string;
        ok?: undefined;
        event?: undefined;
    } | {
        ok: boolean;
        event: string | null;
        plainToken?: undefined;
        encryptedToken?: undefined;
    }>;
    private verifyZoomSignature;
}
