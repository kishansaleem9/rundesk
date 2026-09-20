/**
 * Static Zapier app definition for Rundesk (Plan §12.4).
 *
 * This is a genuine, buildable Zapier "REST Hooks" app description. Its shape
 * mirrors a `zapier-platform-core` App definition, so it can be dropped into a
 * `zapier-platform-cli` project (or pasted into the Zapier Platform UI) and
 * wired straight to the endpoints this module exposes:
 *
 *   auth test          GET    /zapier/auth/test
 *   subscribe   (hook) POST   /zapier/subscribe            { event, targetUrl }
 *   unsubscribe (hook) DELETE /zapier/subscribe/:id
 *   perform-list       GET    /zapier/triggers/:event/sample
 *
 * Authentication is Rundesk's existing workspace **API key** (`rd_live_…`,
 * issued under Settings → Security). Zapier stores it and sends it as
 * `Authorization: Bearer <key>` (or `X-API-Key: <key>`); the key is bound to a
 * single workspace, which scopes every trigger automatically.
 *
 * ─── PUBLISHING NOTE ────────────────────────────────────────────────────────
 * Everything on the RUNDESK side is complete: a Zapier app built from this
 * manifest against these endpoints works end-to-end. Getting the app into
 * Zapier's PUBLIC app directory is an EXTERNAL submission step that cannot be
 * performed from this codebase — it requires running `zapier push` from a
 * Zapier developer account and going through Zapier's app-review process. Until
 * then the app is fully usable as a private/unlisted Zapier integration.
 * ────────────────────────────────────────────────────────────────────────────
 */
type ZapierTrigger = {
    key: string;
    noun: string;
    /** The real Rundesk webhook event this trigger subscribes to. */
    event: string;
    display: {
        label: string;
        description: string;
    };
    operation: {
        type: 'hook';
        performSubscribe: {
            url: string;
            method: 'POST';
            body: Record<string, string>;
        };
        performUnsubscribe: {
            url: string;
            method: 'DELETE';
        };
        /** `perform` receives the live POST; return its `payload`. */
        perform: string;
        /** `performList` backs the "sample"/first-poll — recent real items. */
        performList: {
            url: string;
            method: 'GET';
        };
        sample: Record<string, unknown>;
    };
};
export declare const zapierAppManifest: {
    readonly version: "1.0.0";
    readonly platformVersion: "15.0.0";
    readonly title: "Rundesk";
    readonly description: "Trigger Zaps from Rundesk tasks, comments and time tracking via REST Hooks.";
    readonly authentication: {
        readonly type: "custom";
        readonly fields: readonly [{
            readonly key: "apiKey";
            readonly label: "API Key";
            readonly required: true;
            readonly type: "string";
            readonly helpText: "Create a workspace API key in Rundesk under Settings → Security. It is bound to one workspace and looks like `rd_live_…`.";
        }];
        readonly sendApiKeyIn: {
            readonly header: "Authorization";
            readonly format: "Bearer {{bundle.authData.apiKey}}";
        };
        readonly test: {
            readonly url: "{{process.env.RUNDESK_API_URL}}/zapier/auth/test";
            readonly method: "GET";
        };
        readonly connectionLabel: "{{bundle.inputData.connectionLabel}}";
    };
    readonly triggers: {
        readonly taskCreated: ZapierTrigger;
        readonly taskStatusChanged: ZapierTrigger;
        readonly commentAdded: ZapierTrigger;
        readonly timeLogged: ZapierTrigger;
    };
    readonly _publishing: "Platform side is complete. Publishing to the public Zapier directory is an external `zapier push` + app-review step and cannot be done from this repo.";
};
export {};
