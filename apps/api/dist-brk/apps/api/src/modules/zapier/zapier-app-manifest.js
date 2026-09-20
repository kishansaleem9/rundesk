"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.zapierAppManifest = void 0;
// Base URL is resolved at deploy time. In a real zapier-platform project this
// is typically read from `process.env.BASE_URL`; kept as a placeholder here.
const BASE_URL = '{{process.env.RUNDESK_API_URL}}';
const trigger = (key, event, noun, label, description, sample) => ({
    key,
    noun,
    event,
    display: { label, description },
    operation: {
        type: 'hook',
        performSubscribe: {
            url: `${BASE_URL}/zapier/subscribe`,
            method: 'POST',
            body: { event, targetUrl: '{{bundle.targetUrl}}' },
        },
        performUnsubscribe: {
            url: `${BASE_URL}/zapier/subscribe/{{bundle.subscribeData.id}}`,
            method: 'DELETE',
        },
        perform: 'return [bundle.cleanedRequest.payload]',
        performList: {
            url: `${BASE_URL}/zapier/triggers/${event}/sample`,
            method: 'GET',
        },
        sample,
    },
});
exports.zapierAppManifest = {
    version: '1.0.0',
    platformVersion: '15.0.0',
    title: 'Rundesk',
    description: 'Trigger Zaps from Rundesk tasks, comments and time tracking via REST Hooks.',
    authentication: {
        type: 'custom',
        // Zapier renders these fields on the connection screen.
        fields: [
            {
                key: 'apiKey',
                label: 'API Key',
                required: true,
                type: 'string',
                helpText: 'Create a workspace API key in Rundesk under Settings → Security. It is bound to one workspace and looks like `rd_live_…`.',
            },
        ],
        // How the stored key is attached to every request.
        sendApiKeyIn: { header: 'Authorization', format: 'Bearer {{bundle.authData.apiKey}}' },
        // Connection test + label (Zapier calls this to validate the key).
        test: { url: `${BASE_URL}/zapier/auth/test`, method: 'GET' },
        connectionLabel: '{{bundle.inputData.connectionLabel}}',
    },
    triggers: {
        taskCreated: trigger('taskCreated', 'task.created', 'Task', 'New Task', 'Fires when a task is created in the connected workspace.', { id: 'a1b2c3d4', event: 'task.created', payload: { task: { id: 'a1b2c3d4', title: 'Draft launch plan', status: 'todo' } } }),
        taskStatusChanged: trigger('taskStatusChanged', 'task.status_changed', 'Task', 'Task Status Changed', 'Fires when a task moves to a different status.', { id: 'a1b2c3d4', event: 'task.status_changed', payload: { task: { id: 'a1b2c3d4', title: 'Draft launch plan', status: 'in_progress' } } }),
        // Zapier "Comment Added" maps to the real platform event `comment.created`.
        commentAdded: trigger('commentAdded', 'comment.created', 'Comment', 'Comment Added', 'Fires when a comment is added to a task.', { id: 'c0ffee01', event: 'comment.created', payload: { comment: { id: 'c0ffee01', taskId: 'a1b2c3d4', body: 'Looks good to me!' } } }),
        timeLogged: trigger('timeLogged', 'time.logged', 'Time Entry', 'Time Logged', 'Fires when time is logged against a task.', { id: 't1m3l0g1', event: 'time.logged', payload: { timeEntry: { id: 't1m3l0g1', taskId: 'a1b2c3d4', durationSec: 1800, isBillable: true } } }),
    },
    // Documented for humans; not consumed by Zapier at runtime.
    _publishing: 'Platform side is complete. Publishing to the public Zapier directory is an external `zapier push` + app-review step and cannot be done from this repo.',
};
//# sourceMappingURL=zapier-app-manifest.js.map