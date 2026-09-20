"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarAccountsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const free_busy_1 = require("./free-busy");
/**
 * §V2-14 — a person's calendar accounts, frame `13:50`.
 *
 * `[13:38]` "aur jitna chahoon main add kar sakti hoon."
 *
 * EVERY METHOD IS SCOPED BY `userId`, and that is the security model rather
 * than a convenience. These rows hold OAuth refresh tokens for somebody's
 * personal Google account; an endpoint that took an account id without also
 * proving whose it is would let any member of the workspace unhook — or read
 * the address of — a colleague's calendar. So the id is never trusted alone:
 * every lookup is `(id AND userId)`, and a mismatch is a 404 rather than a 403,
 * because the existence of somebody else's calendar account is not something
 * you should be able to confirm.
 */
const PROVIDERS = ['gcal', 'outlook'];
/** How long one provider gets before its busy time is given up on. */
const FREE_BUSY_TIMEOUT_MS = 4000;
let CalendarAccountsService = class CalendarAccountsService {
    constructor(db) {
        this.db = db;
    }
    assertProvider(value) {
        if (!PROVIDERS.includes(value)) {
            throw new common_1.BadRequestException(`Unknown calendar provider: ${value}`);
        }
        return value;
    }
    /**
     * The accounts a person has connected in this workspace.
     *
     * Projected through `PUBLIC_CALENDAR_ACCOUNT_COLUMNS` so tokens cannot leave
     * by accident — a bare `select()` here would put a refresh token in a JSON
     * response, and nothing else in the request would look wrong.
     */
    async list(userId, workspaceId) {
        return this.db
            .select(db_1.PUBLIC_CALENDAR_ACCOUNT_COLUMNS)
            .from(db_1.userCalendarAccounts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.userId, userId), (0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.workspaceId, workspaceId)))
            .orderBy(db_1.userCalendarAccounts.createdAt);
    }
    /**
     * Record a completed OAuth grant.
     *
     * RE-CONNECTING THE SAME ACCOUNT REFRESHES IT rather than adding a second
     * row — that is what the unique key on `external_account_id` is for. The old
     * behaviour was the opposite and much worse: a second grant for a DIFFERENT
     * account overwrote the first, because the key was (workspace, provider).
     *
     * The first account a person connects becomes their default, because the
     * alternative is a fresh connection that writes nowhere until they visit a
     * settings page they have no reason to think they need.
     */
    async upsertFromOAuth(input) {
        const provider = this.assertProvider(input.provider);
        if (!input.externalAccountId) {
            // Without the provider's own id there is no way to tell a re-connection
            // from a new account, which is exactly the confusion this replaces.
            throw new common_1.BadRequestException('The provider did not identify the account');
        }
        const existing = await this.db
            .select({ id: db_1.userCalendarAccounts.id })
            .from(db_1.userCalendarAccounts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.userId, input.userId), (0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.workspaceId, input.workspaceId), (0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.provider, provider), (0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.externalAccountId, input.externalAccountId)))
            .limit(1);
        const tokens = {
            externalAccountEmail: input.externalAccountEmail ?? null,
            accessToken: input.accessToken ?? null,
            refreshToken: input.refreshToken ?? null,
            tokenExpiresAt: input.tokenExpiresAt ?? null,
            scopes: input.scopes ?? [],
            status: 'connected',
            updatedAt: new Date(),
        };
        if (existing[0]) {
            await this.db
                .update(db_1.userCalendarAccounts)
                .set(tokens)
                .where((0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.id, existing[0].id));
            return { id: existing[0].id, created: false };
        }
        const mine = await this.list(input.userId, input.workspaceId);
        const [row] = await this.db
            .insert(db_1.userCalendarAccounts)
            .values({
            userId: input.userId,
            workspaceId: input.workspaceId,
            provider,
            externalAccountId: input.externalAccountId,
            ...tokens,
            isDefault: mine.length === 0,
        })
            .returning({ id: db_1.userCalendarAccounts.id });
        return { id: row.id, created: true };
    }
    /**
     * "Default calendar" — where new events are written.
     *
     * The clear-then-set is a TRANSACTION because the database enforces at most
     * one default with a partial unique index: setting the new one before
     * clearing the old would collide, and clearing outside a transaction would
     * leave a person with no default at all if the second statement failed.
     */
    async setDefault(userId, workspaceId, accountId) {
        await this.owned(userId, accountId);
        await this.db.transaction(async (tx) => {
            await tx
                .update(db_1.userCalendarAccounts)
                .set({ isDefault: false, updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.userId, userId), (0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.workspaceId, workspaceId)));
            await tx
                .update(db_1.userCalendarAccounts)
                .set({ isDefault: true, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.id, accountId));
        });
        return this.list(userId, workspaceId);
    }
    /** "Busy calendars" — whether this one is read when working out free time. */
    async setCountsAsBusy(userId, workspaceId, accountId, busy) {
        await this.owned(userId, accountId);
        await this.db
            .update(db_1.userCalendarAccounts)
            .set({ countsAsBusy: busy, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.id, accountId));
        return this.list(userId, workspaceId);
    }
    /**
     * Disconnect one account.
     *
     * When the default is removed, the oldest remaining account takes over rather
     * than leaving nobody holding it — a workspace with connected calendars and
     * no default writes new events nowhere, which looks like the sync breaking.
     */
    async remove(userId, workspaceId, accountId) {
        const account = await this.owned(userId, accountId);
        await this.db.delete(db_1.userCalendarAccounts).where((0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.id, accountId));
        if (account.isDefault) {
            const rest = await this.list(userId, workspaceId);
            if (rest[0]) {
                await this.db
                    .update(db_1.userCalendarAccounts)
                    .set({ isDefault: true, updatedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.id, rest[0].id));
            }
        }
        return this.list(userId, workspaceId);
    }
    /**
     * The accounts whose events count as busy — §V2-14c reads this.
     *
     * Returns tokens, because the caller has to talk to the provider. It is
     * deliberately NOT the same method the controller calls, so the safe list and
     * the privileged one cannot be confused at a call site.
     */
    async busyAccountsWithTokens(userId, workspaceId) {
        return this.db
            .select()
            .from(db_1.userCalendarAccounts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.userId, userId), (0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.countsAsBusy, true), (0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.status, 'connected')));
    }
    /**
     * §V2-14c — when this person is busy, according to the calendars they said
     * should decide that.
     *
     * WHAT IS AND IS NOT EXERCISED HERE. The Google call below is real and
     * unverified: this environment has no Google credentials, so no test in this
     * repository reaches it. What IS covered is everything around it — which
     * accounts get asked (`countsAsBusy`), what a returned window is allowed to
     * contain (no title, ever), and how windows merge. The provider's half is
     * the provider's.
     *
     * Failures are swallowed PER ACCOUNT rather than for the whole call: one
     * revoked token should cost that calendar's busy time, not everybody else's.
     */
    async externalBusyWindows(userId, workspaceId, from, to) {
        const accounts = await this.busyAccountsWithTokens(userId, workspaceId);
        const all = [];
        for (const account of accounts) {
            if (account.provider !== 'gcal' || !account.accessToken)
                continue;
            try {
                const url = `https://www.googleapis.com/calendar/v3/freeBusy`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${account.accessToken}`,
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        timeMin: from.toISOString(),
                        timeMax: to.toISOString(),
                        /*
                         * `primary` is Google's own name for the calendar an account owns,
                         * which is why the frame's Default picker shows an email address.
                         * The column is NOT NULL DEFAULT 'primary', so this is the value
                         * every OAuth-connected account already carries; the fallback is
                         * here because sending an empty id would fail SILENTLY — failures
                         * are swallowed per account, so the calendar would simply report
                         * nobody as ever busy.
                         */
                        items: [{ id: account.externalCalendarId || 'primary' }],
                    }),
                    /*
                     * BOUNDED, because this runs inside a request somebody is waiting on.
                     * Without it, Google being slow makes opening a colleague's calendar
                     * hang rather than degrade — and the whole point of catching per
                     * account is that one bad calendar costs only its own busy time.
                     */
                    signal: AbortSignal.timeout(FREE_BUSY_TIMEOUT_MS),
                });
                if (!res.ok)
                    continue;
                /*
                 * freeBusy is used rather than the events list ON PURPOSE. It returns
                 * start/end pairs and nothing else — no summaries, no attendees — so
                 * the titles of somebody's personal appointments never enter this
                 * process at all. Filtering them out after fetching would work until
                 * the day somebody logged the response.
                 */
                const body = (await res.json());
                for (const cal of Object.values(body.calendars ?? {})) {
                    for (const slot of cal.busy ?? [])
                        all.push({ start: slot.start, end: slot.end });
                }
            }
            catch {
                // One calendar failing is not the others' problem.
                continue;
            }
        }
        return (0, free_busy_1.toBusyWindows)(all, 'external');
    }
    /**
     * An account belonging to this person, or a 404.
     *
     * 404 rather than 403 on a mismatch: whether a colleague has connected a
     * calendar is not something the id in a URL should be able to confirm.
     */
    async owned(userId, accountId) {
        const [row] = await this.db
            .select({
            id: db_1.userCalendarAccounts.id,
            isDefault: db_1.userCalendarAccounts.isDefault,
            userId: db_1.userCalendarAccounts.userId,
        })
            .from(db_1.userCalendarAccounts)
            .where((0, drizzle_orm_1.eq)(db_1.userCalendarAccounts.id, accountId))
            .limit(1);
        if (!row || row.userId !== userId)
            throw new common_1.NotFoundException('Calendar account not found');
        return row;
    }
};
exports.CalendarAccountsService = CalendarAccountsService;
exports.CalendarAccountsService = CalendarAccountsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], CalendarAccountsService);
//# sourceMappingURL=calendar-accounts.service.js.map