import type { Db } from '@rundesk/db';
import { NotificationsService } from '../notifications/notifications.service';
import { PlansService } from './plans.service';
/**
 * §V2-13, frame `09:26` — the button under the paywall.
 *
 * The frame's call to action is **"Contact your admin"**, and it is the whole
 * reason the modal is worth building: a person who cannot buy anything is being
 * shown a price, so the only useful thing the dialog can do is put the ask in
 * front of somebody who can.
 *
 * A PLAN feature is not a feature FLAG, so `POST /feature-flags/request/:key`
 * could not serve this — it validates against the flag registry and 400s on
 * anything else. Rather than invent a flag that mirrors a plan tier (the
 * duplicated-list defect, in its most expensive form: two switches for one
 * capability that drift), this is the same ask against the plan model, and it
 * answers in the SAME `{ status, notified }` shape the flag route does so the
 * dialog's outcome strings and its "can I press it again" rule are shared.
 *
 * `already_asked` is deliberately NOT a state here. The flag route has a
 * `feature_flag_requests` table to read a recent ask out of; there is no
 * equivalent for plans, and inventing a throttle that no row backs would be a
 * rule that silently never fires.
 */
export declare class PlanRequestsController {
    private readonly db;
    private readonly plans;
    private readonly notifications;
    constructor(db: Db, plans: PlansService, notifications: NotificationsService);
    request(workspaceId: string, body: {
        feature?: string;
    }, user: any): Promise<{
        status: 'sent' | 'already_enabled' | 'no_admins';
        notified: number;
    }>;
}
