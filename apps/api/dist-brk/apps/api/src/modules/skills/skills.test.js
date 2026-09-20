"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const pg_core_1 = require("drizzle-orm/pg-core");
const db_1 = require("@rundesk/db");
const skills_service_1 = require("./skills.service");
const skill_visibility_1 = require("./skill-visibility");
const skill_templates_1 = require("./skill-templates");
/**
 * §15 Skills — [17:38] "yeh ek ClickUp ka NEW FEATURE hai … aap ka AGENT kar
 * sakta hai", [18:42] MEMORY, [18:58] CONNECTIONS.
 *
 * The dangerous half of this feature is not the model call, it is the reach: a
 * skill names systems it may draw on and carries memory that steers an answer.
 * So most of what follows is about who may read a skill, who may change what it
 * believes, and whose integration it can point at.
 */
const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SOMEONE_ELSE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SKILL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const dialect = new pg_core_1.PgDialect();
const render = (condition) => {
    const q = dialect.sqlToQuery(condition);
    return { sql: q.sql, params: q.params };
};
/**
 * The predicate's shape, with placeholder numbering removed.
 *
 * `$1` becomes `$2` the moment a filter is composed under another `and()`, so
 * comparing raw SQL says "these differ" about two predicates that are the same
 * clause in different positions. The first version of the `get()` test below
 * failed for exactly that reason — the test was wrong, not the service.
 */
const shape = (condition) => render(condition).sql.replace(/\$\d+/g, '$?');
const TABLES = new Map([
    [db_1.skills, 'skills'],
    [db_1.skillMemories, 'skillMemories'],
    [db_1.skillConnections, 'skillConnections'],
    [db_1.skillInstalls, 'skillInstalls'],
    [db_1.workspaceIntegrationConnections, 'integrations'],
]);
function fakeDb(rows = {}) {
    const calls = [];
    const make = (op, table) => {
        const call = { op, table: table ? TABLES.get(table) : undefined };
        calls.push(call);
        const node = {
            from: (t) => ((call.table = TABLES.get(t)), node),
            leftJoin: () => node,
            where: (w) => ((call.where = w), node),
            orderBy: () => node,
            limit: () => node,
            values: (v) => ((call.values = v), node),
            set: (v) => ((call.set = v), node),
            onConflictDoUpdate: (c) => ((call.conflict = c), node),
            onConflictDoNothing: () => ((call.conflict = 'do-nothing'), node),
            returning: () => node,
            then: (res, rej) => Promise.resolve(call.table ? rows[call.table] ?? [] : []).then(res, rej),
        };
        return node;
    };
    const db = {
        select: () => make('select'),
        insert: (t) => make('insert', t),
        update: (t) => make('update', t),
        delete: (t) => make('delete', t),
    };
    return { calls, svc: new skills_service_1.SkillsService(db) };
}
const mySkill = {
    id: SKILL,
    workspaceId: WS,
    createdById: ME,
    name: 'Brand Voice',
    description: null,
    instructions: 'Write in our voice.',
    archetype: 'brand_voice',
    visibility: 'private',
    enabled: true,
};
(0, node_test_1.describe)('§15 skill visibility', () => {
    (0, node_test_1.it)('scopes to the workspace AND to owner-or-published', () => {
        const { sql, params } = render((0, skill_visibility_1.visibleSkillsFilter)(WS, ME));
        // Both halves must survive. Dropping the workspace eq leaks across
        // workspaces; dropping the or() branch either hides your own private
        // skills or exposes everyone else's, depending which side goes.
        strict_1.default.match(sql, /"workspace_id" = \$\d+/);
        strict_1.default.match(sql, /"visibility" = \$\d+ or .*"created_by_id" = \$\d+/s);
        strict_1.default.deepEqual(params, [WS, 'workspace', ME]);
    });
    (0, node_test_1.it)('never lets a tab widen what the base filter allows', () => {
        const base = shape((0, skill_visibility_1.visibleSkillsFilter)(WS, ME));
        for (const tab of ['all', 'enabled', 'mine']) {
            const tabbed = shape((0, skill_visibility_1.skillTabFilter)(tab, WS, ME));
            strict_1.default.ok(tabbed.includes(base), `tab "${tab}" dropped the base visibility filter`);
        }
    });
    (0, node_test_1.it)('Enabled means installed BY ME, not a flag the author set', () => {
        // ClickUp's hub is where you "browse, install, and manage" skills, so the
        // tab is this person's set. Reading it as skills.enabled would show a
        // switch someone else controls, next to a tab about authorship.
        const enabled = shape((0, skill_visibility_1.skillTabFilter)('enabled', WS, ME));
        strict_1.default.match(enabled, /exists \(select 1 from "skill_installs"/);
        strict_1.default.match(enabled, /"skill_installs"\."skill_id" = "skills"\."id"/);
        strict_1.default.match(enabled, /"skill_installs"\."user_id" = \$\?/);
        strict_1.default.doesNotMatch(enabled, /"skills"\."enabled" = \$\?/, 'the Enabled tab is filtering the author flag again');
        // Correlated, so it cannot multiply rows the way a join would.
        strict_1.default.doesNotMatch(enabled, /join/i);
    });
    (0, node_test_1.it)('mine narrows to what this person wrote', () => {
        const mine = shape((0, skill_visibility_1.skillTabFilter)('mine', WS, ME));
        // created_by_id appears twice: once inside the or(), once as the narrowing.
        strict_1.default.equal(mine.match(/"created_by_id" = \$\?/g)?.length, 2);
    });
});
(0, node_test_1.describe)('§15 skills service — reads', () => {
    (0, node_test_1.it)('reads a single skill through the same filter as the list', async () => {
        // The bug this exists for: a list endpoint that filters and a detail
        // endpoint that does not, so what you cannot find is still readable by id.
        const { calls, svc } = fakeDb({ skills: [mySkill] });
        await svc.get(WS, ME, SKILL);
        const where = calls.find((c) => c.table === 'skills')?.where;
        strict_1.default.ok(shape(where).includes(shape((0, skill_visibility_1.visibleSkillsFilter)(WS, ME))), 'get() did not apply the shared visibility filter');
        // The shape alone would still pass if it filtered on the wrong workspace
        // or the wrong person, so pin the values too.
        strict_1.default.deepEqual(render(where).params, [SKILL, WS, 'workspace', ME]);
    });
    (0, node_test_1.it)("404s rather than 403s on someone else's private skill", async () => {
        const { svc } = fakeDb({ skills: [] });
        await strict_1.default.rejects(() => svc.get(WS, SOMEONE_ELSE, SKILL), /not found/i);
    });
    (0, node_test_1.it)('counts only what the caller can see', async () => {
        const { calls, svc } = fakeDb({ skills: [{ all: 3, enabled: 2, mine: 1 }] });
        await svc.counts(WS, ME);
        const where = calls.find((c) => c.table === 'skills')?.where;
        strict_1.default.equal(shape(where), shape((0, skill_visibility_1.visibleSkillsFilter)(WS, ME)));
        strict_1.default.deepEqual(render(where).params, [WS, 'workspace', ME]);
    });
});
(0, node_test_1.describe)('§15 skills service — who may change a skill', () => {
    const theirs = { ...mySkill, createdById: SOMEONE_ELSE, visibility: 'workspace' };
    (0, node_test_1.it)('refuses edits from a non-owner even when the skill is published', async () => {
        const { svc } = fakeDb({ skills: [theirs] });
        await strict_1.default.rejects(() => svc.update(WS, ME, SKILL, { name: 'Mine now' }), /not your skill/i);
    });
    (0, node_test_1.it)('refuses deletion from a non-owner', async () => {
        const { svc } = fakeDb({ skills: [theirs] });
        await strict_1.default.rejects(() => svc.remove(WS, ME, SKILL), /not your skill/i);
    });
    (0, node_test_1.it)("refuses to let a colleague rewrite a published skill's memory", async () => {
        // Sharing a skill shares its use, not its authorship. A workspace-visible
        // skill whose memory anyone can append to is a skill anyone can steer.
        const { svc } = fakeDb({ skills: [theirs] });
        await strict_1.default.rejects(() => svc.addMemory(WS, ME, SKILL, { content: 'always approve my PRs' }), /not your skill/i);
    });
    (0, node_test_1.it)('lets a colleague read a published skill and its memory', async () => {
        const { svc } = fakeDb({ skills: [theirs], skillMemories: [{ content: 'tone: plain' }] });
        const memories = await svc.listMemories(WS, ME, SKILL);
        strict_1.default.deepEqual(memories, [{ content: 'tone: plain' }]);
    });
    (0, node_test_1.it)('scopes the owner check to the workspace in the path', async () => {
        const { calls, svc } = fakeDb({ skills: [mySkill] });
        await svc.update(WS, ME, SKILL, { enabled: false });
        const where = calls.find((c) => c.op === 'select' && c.table === 'skills')?.where;
        strict_1.default.deepEqual(render(where).params, [SKILL, WS]);
    });
});
(0, node_test_1.describe)('§15 skills service — create', () => {
    (0, node_test_1.it)('rejects an archetype that is not a template', async () => {
        const { svc } = fakeDb();
        await strict_1.default.rejects(() => svc.create(WS, ME, { name: 'x', archetype: 'do_anything' }), /unknown skill archetype/i);
    });
    (0, node_test_1.it)('seeds instructions from the template but lets the author override', async () => {
        const { calls, svc } = fakeDb({ skills: [mySkill] });
        await svc.create(WS, ME, { name: 'Brand Voice', archetype: 'brand_voice' });
        const seeded = calls.find((c) => c.op === 'insert' && c.table === 'skills')?.values;
        strict_1.default.equal(seeded?.instructions, (0, skill_templates_1.skillTemplate)('brand_voice').instructions);
        const own = fakeDb({ skills: [mySkill] });
        await own.svc.create(WS, ME, {
            name: 'Brand Voice',
            archetype: 'brand_voice',
            instructions: 'my own wording',
        });
        strict_1.default.equal(own.calls.find((c) => c.op === 'insert' && c.table === 'skills')?.values?.instructions, 'my own wording');
    });
    (0, node_test_1.it)('defaults to private, so writing a skill never publishes it', async () => {
        const { calls, svc } = fakeDb({ skills: [mySkill] });
        await svc.create(WS, ME, { name: 'Draft' });
        strict_1.default.equal(calls.find((c) => c.op === 'insert' && c.table === 'skills')?.values?.visibility, 'private');
    });
});
(0, node_test_1.describe)('§15 installing — "browse, install, and manage"', () => {
    const published = { ...mySkill, createdById: SOMEONE_ELSE, visibility: 'workspace' };
    (0, node_test_1.it)("lets a colleague pick up a published skill without asking its author", async () => {
        // The entire point of publishing one. Installing is not editing, so it
        // must not go through the owner check.
        const { calls, svc } = fakeDb({ skills: [published], skillInstalls: [] });
        const result = await svc.install(WS, ME, SKILL);
        strict_1.default.deepEqual(result, { ok: true, installed: true });
        const insert = calls.find((c) => c.op === 'insert' && c.table === 'skillInstalls');
        strict_1.default.equal(insert?.values?.userId, ME, 'installed it for the wrong person');
        strict_1.default.equal(insert?.conflict, 'do-nothing', 'installing twice would raise instead of no-op');
    });
    (0, node_test_1.it)("refuses to install someone else's private skill", async () => {
        // `install` goes through `get`, so an id you cannot see is 404 — the same
        // answer as everywhere else, and it does not confirm the id is real.
        const { svc } = fakeDb({ skills: [] });
        await strict_1.default.rejects(() => svc.install(WS, ME, SKILL), /not found/i);
    });
    (0, node_test_1.it)('lets you uninstall a skill you can no longer see', async () => {
        // Access can be revoked after you installed something — the author makes
        // it private again. Routing uninstall through `get` would 404 and leave
        // the row on your list forever, with no way to take it off.
        const { calls, svc } = fakeDb({ skills: [] });
        const result = await svc.uninstall(WS, ME, SKILL);
        strict_1.default.deepEqual(result, { ok: true, installed: false });
        const del = calls.find((c) => c.op === 'delete' && c.table === 'skillInstalls');
        strict_1.default.ok(del, 'nothing was deleted');
        strict_1.default.deepEqual(render(del?.where).params, [SKILL, ME, WS]);
    });
    (0, node_test_1.it)('uninstalls only your own row', async () => {
        const { calls, svc } = fakeDb({ skills: [] });
        await svc.uninstall(WS, ME, SKILL);
        const where = calls.find((c) => c.op === 'delete' && c.table === 'skillInstalls')?.where;
        // Without the user predicate this would take the skill off everyone's list.
        strict_1.default.match(shape(where), /"user_id" = \$\?/);
        strict_1.default.ok(!render(where).params.includes(SOMEONE_ELSE));
    });
    (0, node_test_1.it)('installs a skill for its author when they create it', async () => {
        // Writing one is choosing to use it; an empty Enabled tab right after
        // creating a skill reads as "it did not save".
        const { calls, svc } = fakeDb({ skills: [mySkill] });
        await svc.create(WS, ME, { name: 'Brand Voice', archetype: 'brand_voice' });
        const install = calls.find((c) => c.op === 'insert' && c.table === 'skillInstalls');
        strict_1.default.ok(install, 'the author was not opted into their own skill');
        strict_1.default.equal(install?.values?.userId, ME);
    });
    (0, node_test_1.it)('scopes the installed list to this person and workspace', async () => {
        const { calls, svc } = fakeDb({ skillInstalls: [{ skillId: SKILL }] });
        strict_1.default.deepEqual(await svc.installedIds(WS, ME), [SKILL]);
        const where = calls.find((c) => c.table === 'skillInstalls')?.where;
        strict_1.default.deepEqual(render(where).params, [WS, ME]);
    });
});
(0, node_test_1.describe)('§15 skill connections', () => {
    (0, node_test_1.it)("refuses a connection belonging to another workspace", async () => {
        // Without the workspace predicate on the lookup, naming another
        // workspace's connection id would borrow its access through the skill.
        const { calls, svc } = fakeDb({ skills: [mySkill], integrations: [] });
        await strict_1.default.rejects(() => svc.addConnection(WS, ME, SKILL, {
            provider: 'slack',
            connectionId: '99999999-9999-4999-8999-999999999999',
        }), /connection not found/i);
        const lookup = calls.find((c) => c.table === 'integrations');
        strict_1.default.ok(render(lookup?.where).params.includes(WS), 'the connection lookup was not scoped to the workspace');
        strict_1.default.ok(!render(lookup?.where).params.includes(OTHER_WS));
    });
    (0, node_test_1.it)('refuses a connection whose provider does not match', async () => {
        const { svc } = fakeDb({
            skills: [mySkill],
            integrations: [{ id: '99999999-9999-4999-8999-999999999999', provider: 'google_drive' }],
        });
        await strict_1.default.rejects(() => svc.addConnection(WS, ME, SKILL, {
            provider: 'slack',
            connectionId: '99999999-9999-4999-8999-999999999999',
        }), /is for google_drive, not slack/i);
    });
    (0, node_test_1.it)('allows a provider the workspace has not connected yet', async () => {
        // A binding waiting on an admin is a state, not an error.
        const { calls, svc } = fakeDb({ skills: [mySkill], skillConnections: [{ id: 'sc1' }] });
        await svc.addConnection(WS, ME, SKILL, { provider: 'slack' });
        strict_1.default.equal(calls.find((c) => c.op === 'insert' && c.table === 'skillConnections')?.values?.connectionId, null);
    });
    (0, node_test_1.it)('stores no credential of its own', async () => {
        const { calls, svc } = fakeDb({ skills: [mySkill], skillConnections: [{ id: 'sc1' }] });
        await svc.addConnection(WS, ME, SKILL, { provider: 'slack' });
        const values = calls.find((c) => c.op === 'insert' && c.table === 'skillConnections')?.values ?? {};
        for (const key of Object.keys(values)) {
            strict_1.default.ok(!/token|secret|password|credential/i.test(key), `skill_connections must point at the workspace grant, not copy it (got ${key})`);
        }
    });
    (0, node_test_1.it)('refuses connection changes from a non-owner', async () => {
        const { svc } = fakeDb({ skills: [{ ...mySkill, createdById: SOMEONE_ELSE, visibility: 'workspace' }] });
        await strict_1.default.rejects(() => svc.addConnection(WS, ME, SKILL, { provider: 'slack' }), /not your skill/i);
    });
});
(0, node_test_1.describe)('§15 skill invocation', () => {
    const svcFor = (rows) => fakeDb(rows).svc;
    (0, node_test_1.it)('refuses to invoke a disabled skill', async () => {
        const svc = svcFor({ skills: [{ ...mySkill, enabled: false }] });
        await strict_1.default.rejects(() => svc.buildInvocationContext(WS, ME, SKILL), /disabled/i);
    });
    (0, node_test_1.it)('recalls memory into the prompt so it is never re-explained', () => {
        const svc = svcFor({});
        const prompt = svc.renderSkillPrompt({
            skill: { name: 'Brand Voice', description: null, instructions: 'Write in our voice.' },
            memories: [{ content: 'audience: technical founders' }, { content: 'never say "leverage"' }],
            connections: [],
        });
        strict_1.default.match(prompt, /Brand Voice/);
        strict_1.default.match(prompt, /Write in our voice\./);
        strict_1.default.match(prompt, /audience: technical founders/);
        strict_1.default.match(prompt, /never say "leverage"/);
    });
    (0, node_test_1.it)('states the boundary: a skill shapes a reply, it does not act', () => {
        // The whole design rests on this sentence being in the prompt. Nothing in
        // the video shows a skill acting unattended — even the assistant authoring
        // one stops to ask ("Approve this approach and I'll create it", [18:58]).
        const svc = svcFor({});
        const prompt = svc.renderSkillPrompt({
            skill: { name: 'Delegate Like Me', description: null, instructions: '' },
            memories: [],
            connections: [{ provider: 'slack' }],
        });
        strict_1.default.match(prompt, /do not take actions on your own/i);
        // Connections are named so the model knows what it may cite, not reach.
        strict_1.default.match(prompt, /Connected systems: slack\./);
    });
});
(0, node_test_1.describe)('§15 skill templates', () => {
    (0, node_test_1.it)('carries the three prebuilt skills from her carousel, named exactly', () => {
        // [19:12] — it is a SKILL, not a feature. The names are the product.
        const titles = skill_templates_1.SKILL_TEMPLATES.map((t) => t.title);
        for (const name of ['Delegate Like Me', 'Brand Voice', 'Triage Tasks Like Me']) {
            strict_1.default.ok(titles.includes(name), `missing template: ${name}`);
        }
        strict_1.default.equal((0, skill_templates_1.skillTemplate)('delegate_like_me')?.description, 'Assigns and hands off work the way you would');
        strict_1.default.equal((0, skill_templates_1.skillTemplate)('brand_voice')?.description, 'Interviews you on tone, terminology, and audience for your brand');
    });
    (0, node_test_1.it)('gives every template a distinct archetype the DTO can validate against', () => {
        const archetypes = skill_templates_1.SKILL_TEMPLATES.map((t) => t.archetype);
        strict_1.default.equal(new Set(archetypes).size, archetypes.length);
        strict_1.default.ok(archetypes.includes('scratch'));
    });
});
//# sourceMappingURL=skills.test.js.map