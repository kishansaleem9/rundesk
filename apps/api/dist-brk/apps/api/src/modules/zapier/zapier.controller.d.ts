import { ZapierService } from './zapier.service';
import { type ZapierContext } from './zapier-api-key.guard';
/**
 * Zapier REST-Hooks contract (Plan §12.4). Every route is authenticated by a
 * workspace API key ({@link ZapierApiKeyGuard}) — the key resolves both the
 * caller and the workspace, which is why these routes carry no `:workspaceId`.
 */
export declare class ZapierController {
    private readonly svc;
    constructor(svc: ZapierService);
    authTest(ctx: ZapierContext): Promise<{
        ok: boolean;
        workspace: {
            id: string;
            name: string;
            slug: string;
        };
        user: {
            id: string;
            email: string;
            displayName: string;
        } | null;
        connectionLabel: string;
    }>;
    subscribe(ctx: ZapierContext, body: {
        event: string;
        targetUrl: string;
    }): Promise<{
        id: string;
    }>;
    unsubscribe(ctx: ZapierContext, id: string): Promise<{
        ok: boolean;
    }>;
    sample(ctx: ZapierContext, event: string): Promise<{
        id: string;
        event: string;
        payload: Record<string, unknown>;
        timestamp: string;
    }[]>;
    manifest(): {
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
            readonly taskCreated: {
                key: string;
                noun: string;
                event: string;
                display: {
                    label: string;
                    description: string;
                };
                operation: {
                    type: "hook";
                    performSubscribe: {
                        url: string;
                        method: "POST";
                        body: Record<string, string>;
                    };
                    performUnsubscribe: {
                        url: string;
                        method: "DELETE";
                    };
                    perform: string;
                    performList: {
                        url: string;
                        method: "GET";
                    };
                    sample: Record<string, unknown>;
                };
            };
            readonly taskStatusChanged: {
                key: string;
                noun: string;
                event: string;
                display: {
                    label: string;
                    description: string;
                };
                operation: {
                    type: "hook";
                    performSubscribe: {
                        url: string;
                        method: "POST";
                        body: Record<string, string>;
                    };
                    performUnsubscribe: {
                        url: string;
                        method: "DELETE";
                    };
                    perform: string;
                    performList: {
                        url: string;
                        method: "GET";
                    };
                    sample: Record<string, unknown>;
                };
            };
            readonly commentAdded: {
                key: string;
                noun: string;
                event: string;
                display: {
                    label: string;
                    description: string;
                };
                operation: {
                    type: "hook";
                    performSubscribe: {
                        url: string;
                        method: "POST";
                        body: Record<string, string>;
                    };
                    performUnsubscribe: {
                        url: string;
                        method: "DELETE";
                    };
                    perform: string;
                    performList: {
                        url: string;
                        method: "GET";
                    };
                    sample: Record<string, unknown>;
                };
            };
            readonly timeLogged: {
                key: string;
                noun: string;
                event: string;
                display: {
                    label: string;
                    description: string;
                };
                operation: {
                    type: "hook";
                    performSubscribe: {
                        url: string;
                        method: "POST";
                        body: Record<string, string>;
                    };
                    performUnsubscribe: {
                        url: string;
                        method: "DELETE";
                    };
                    perform: string;
                    performList: {
                        url: string;
                        method: "GET";
                    };
                    sample: Record<string, unknown>;
                };
            };
        };
        readonly _publishing: "Platform side is complete. Publishing to the public Zapier directory is an external `zapier push` + app-review step and cannot be done from this repo.";
    };
}
