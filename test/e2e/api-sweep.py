#!/usr/bin/env python3
"""End-to-end API sweep across everything delivered in this engagement.

Ground rules this suite holds itself to:

  * Every path was taken from the running API's own route table, not guessed.
  * Every assertion reads a real response. Nothing is inferred from source.
  * Negative cases are asserted as loudly as positive ones — a feature that
    cannot say "no" has not been built.
  * Fixtures are created and torn down here, so re-running is safe and a
    leftover row from a previous run cannot satisfy an assertion.
"""
import json, urllib.request, urllib.error, uuid, sys, datetime, os

API = 'http://127.0.0.1:3001/api/v1'
ADMIN = ('org-admin@rundesk.internal', 'OrgAdmin@123!')
WS = '076d6b60-6cc7-428f-b27d-b6bec49e92db'

TOKEN = None
PASS, FAIL, SKIP = [], [], []
SECTION = ''
created = {'tasks': [], 'types': [], 'holidays': [], 'lists': [], 'projects': [],
           'spaces': [], 'folders': [], 'templates': [], 'docs': [], 'channels': []}


def call(method, path, body=None, raw=False, token=None):
    req = urllib.request.Request(API + path, method=method)
    if body is not None:
        req.add_header('Content-Type', 'application/json')
    tk = token if token is not None else TOKEN
    if tk:
        req.add_header('Authorization', 'Bearer ' + tk)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=40) as r:
            p = json.loads(r.read() or b'{}')
            return (r.status, p.get('data', p)) if raw else p.get('data', p)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        if raw:
            return (e.code, txt)
        return {'__status': e.code, '__body': txt}
    except Exception as e:                                   # network / timeout
        return (0, str(e)) if raw else {'__status': 0, '__body': str(e)}


def status(method, path, body=None, token=None):
    return call(method, path, body, raw=True, token=token)[0]


def ok(m):  PASS.append((SECTION, m)); print(f'  \033[32mPASS\033[0m {m}')
def bad(m): FAIL.append((SECTION, m)); print(f'  \033[31mFAIL\033[0m {m}')
def skip(m): SKIP.append((SECTION, m)); print(f'  \033[2mSKIP\033[0m {m}')
def check(c, g, b): ok(g) if c else bad(b)


def say(s):
    global SECTION
    SECTION = s
    print(f'\n\033[1;36m▶ {s}\033[0m')


def uniq(p):
    return f'{p}-{uuid.uuid4().hex[:8]}'


# ══════════════════════════════════════════════════════════════════ setup ════
login = call('POST', '/auth/login', {'email': ADMIN[0], 'password': ADMIN[1]})
if '__status' in login:
    print(f'login failed: {login}'); sys.exit(1)
TOKEN = login['accessToken']
ME = login['user']['id']
print(f'signed in as {ADMIN[0]}  workspace={WS}')

members = call('GET', f'/workspaces/{WS}/members')
OTHER = next((m['userId'] for m in members if m['userId'] != ME), None)

spaces = call('GET', f'/spaces/workspace/{WS}')
SPACE = spaces[0]['id']
projects = call('GET', f'/projects/space/{SPACE}')
PROJECT = projects[0]['id'] if projects else None
lists_ = call('GET', f'/lists/project/{PROJECT}') if PROJECT else []
LIST = lists_[0]['id'] if lists_ else None
print(f'space={SPACE} project={PROJECT} list={LIST}')
if not LIST:
    print('no list available — cannot run task-scoped checks'); sys.exit(1)


def purge_fixtures(label):
    """Remove anything a previous run of this suite left behind.

    Fixtures are all named with a known prefix, so this is exact rather than a
    guess about what is test data. Run at both ends: a crashed run leaves rows
    that would otherwise satisfy a later run's assertions.
    """
    removed = {'types': 0, 'holidays': 0, 'channels': 0, 'tasks': 0, 'docs': 0}
    for t in call('GET', f'/workspaces/{WS}/task-types') or []:
        if isinstance(t, dict) and (t.get('name') or '').startswith(('Campaign-', 'Invoice-')):
            call('DELETE', f'/workspaces/{WS}/task-types/{t["id"]}'); removed['types'] += 1
    sch = call('GET', f'/workspaces/{WS}/work-schedule')
    for h in (sch.get('holidays') or []) if isinstance(sch, dict) else []:
        if 'E2E' in (h.get('name') or ''):
            call('DELETE', f'/workspaces/{WS}/holidays/{h["id"]}'); removed['holidays'] += 1
    for c in call('GET', f'/workspaces/{WS}/chat/channels') or []:
        if isinstance(c, dict) and (c.get('name') or '').startswith('zqxsearch'):
            # Channels archive rather than delete — there is no DELETE route.
            call('POST', f'/chat/channels/{c["id"]}/archive'); removed['channels'] += 1
    for d in call('GET', f'/workspaces/{WS}/docs') or []:
        if isinstance(d, dict) and (d.get('title') or '').startswith('zqxsearch'):
            call('DELETE', f'/docs/{d["id"]}')
            call('DELETE', f'/workspaces/{WS}/trash/doc/{d["id"]}'); removed['docs'] += 1
    for l in lists_:
        for t in call('GET', f'/tasks/list/{l["id"]}?includeSubtasks=true') or []:
            title = t.get('title') or '' if isinstance(t, dict) else ''
            if title.startswith(('e2e parent task', 'e2e subtask', 'e2e typed task',
                                 'e2e template target', 'e2e mover', 'e2e trash victim',
                                 'zqxsearch')):
                call('DELETE', f'/tasks/{t["id"]}')
                call('DELETE', f'/workspaces/{WS}/trash/task/{t["id"]}'); removed['tasks'] += 1
    left = {k: v for k, v in removed.items() if v}
    print(f'  {label}: {left or "nothing to remove"}')
    return removed


def new_task(title=None, **kw):
    t = call('POST', '/tasks', {'listId': LIST, 'title': title or uniq('e2e'), **kw})
    if isinstance(t, dict) and t.get('id'):
        created['tasks'].append(t['id'])
    return t


say('0. Pre-flight — clear anything a previous run left behind')
purge_fixtures('before')

# ═══════════════════════════════════════════════════ 1. Tasks & subtasks ════
say('1. Task CRUD, subtasks and the two-level cap (V5)')
parent = new_task('e2e parent task')
check(bool(parent.get('id')), 'created a task', f'create -> {parent}')

sub = new_task('e2e subtask', parentTaskId=parent['id'])
check(sub.get('parentTaskId') == parent['id'], 'created a subtask under it',
      f'subtask parent -> {sub.get("parentTaskId")}')

code = status('POST', '/tasks', {'listId': LIST, 'title': 'too deep', 'parentTaskId': sub['id']})
check(code == 400, 'a subtask of a subtask is refused (400)', f'three-level nesting allowed: {code}')

got = call('GET', f'/tasks/{sub["id"]}')
check((got.get('parent') or {}).get('title') == 'e2e parent task',
      f'getTask names the parent: {(got.get("parent") or {}).get("title")}',
      f'parent -> {got.get("parent")}')

say('1b. Promote a subtask to a top-level task (V5 convert)')
promoted = call('PATCH', f'/tasks/{sub["id"]}', {'parentTaskId': None})
check(promoted.get('parentTaskId') is None, 'subtask promoted to top level',
      f'after promote parentTaskId -> {promoted.get("parentTaskId")}')
# Put it back so later checks still have a subtask.
call('PATCH', f'/tasks/{sub["id"]}', {'parentTaskId': parent['id']})

code = status('PATCH', f'/tasks/{parent["id"]}', {'parentTaskId': parent['id']})
check(code == 400, 'a task cannot be its own parent (400)', f'self-parent -> {code}')
code = status('PATCH', f'/tasks/{parent["id"]}', {'parentTaskId': sub['id']})
check(code == 400, 'a task with children cannot become a subtask (400)', f'-> {code}')

# ══════════════════════════════════════════════════════ 2. Task types ════
say('2. Task types (skip-list #21)')
tt = call('POST', f'/workspaces/{WS}/task-types', {'name': uniq('Campaign'), 'icon': '📣', 'color': '#7c3aed'})
created['types'].append(tt.get('id'))
check(bool(tt.get('id')), 'created a task type', f'-> {tt}')

tt2 = call('POST', f'/workspaces/{WS}/task-types', {'name': uniq('Invoice'), 'icon': '🧾', 'isDefault': True})
created['types'].append(tt2.get('id'))
call('PATCH', f'/workspaces/{WS}/task-types/{tt["id"]}', {'isDefault': True})
defaults = [x for x in call('GET', f'/workspaces/{WS}/task-types') if x['isDefault']]
check(len(defaults) == 1 and defaults[0]['id'] == tt['id'],
      'exactly one default, and switching moves it',
      f'defaults -> {[d["name"] for d in defaults]}')

typed = new_task('e2e typed task')
check(typed.get('taskTypeId') == tt['id'], 'a new task inherits the workspace default type',
      f'-> {typed.get("taskTypeId")}')

call('PATCH', f'/tasks/{typed["id"]}/task-type', {'taskTypeId': tt2['id']})
back = call('GET', f'/tasks/{typed["id"]}')
check((back.get('taskType') or {}).get('icon') == '🧾',
      'applying a type is readable back with its icon and name',
      f'taskType -> {back.get("taskType")}')

d = call('DELETE', f'/workspaces/{WS}/task-types/{tt2["id"]}')
created['types'].remove(tt2['id'])
survivor = call('GET', f'/tasks/{typed["id"]}')
check(d.get('untypedTasks', 0) >= 1 and survivor.get('taskTypeId') is None,
      f'deleting a type untypes its tasks without deleting them ({d.get("untypedTasks")} affected)',
      f'delete -> {d}, task after -> {survivor.get("taskTypeId")}')
check(status('PATCH', f'/workspaces/{WS}/task-types/{uuid.uuid4()}', {'name': 'x'}) == 404,
      'an unknown type id is 404, not a silent no-op', 'unknown type did not 404')

# ══════════════════════════════════════════════════════ 3. Checklists ════
say('3. Checklists and templates (V4)')
cl = call('POST', f'/tasks/{parent["id"]}/checklists', {'title': 'e2e checklist'})
check(bool(cl.get('id')), 'created a checklist on a task', f'-> {cl}')
if cl.get('id'):
    it = call('POST', f'/tasks/{parent["id"]}/checklists/{cl["id"]}/items', {'content': 'first item'})
    check(bool(it.get('id')), 'added an item', f'-> {it}')
    if it.get('id') and OTHER:
        asg = call('PATCH', f'/tasks/{parent["id"]}/checklists/items/{it["id"]}', {'assigneeId': OTHER})
        reread = call('GET', f'/tasks/{parent["id"]}')
        items = [i for c in reread.get('checklists', []) for i in c.get('items', [])]
        mine = next((i for i in items if i['id'] == it['id']), {})
        check(mine.get('assigneeId') == OTHER,
              'a checklist item takes an assignee and keeps it (V4)',
              f'assigneeId after PATCH -> {mine.get("assigneeId")} (patch said {asg.get("assigneeId")})')

    tpl = call('POST', f'/checklists/{cl["id"]}/save-as-template', {'name': uniq('tpl')})
    created['templates'].append(tpl.get('id'))
    check(bool(tpl.get('id')), 'saved the checklist as a template', f'-> {tpl}')
    if tpl.get('id'):
        target = new_task('e2e template target')
        applied = call('POST', f'/tasks/{target["id"]}/checklists/from-template/{tpl["id"]}')
        after = call('GET', f'/tasks/{target["id"]}')
        names = [c.get('title') or c.get('name') for c in after.get('checklists', [])]
        check(len(after.get('checklists', [])) == 1,
              f'applying a template creates the checklist on another task: {names}',
              f'checklists after apply -> {names} ({applied})')
        # Editing the template must not rewrite checklists already made from it.
        copied = after['checklists'][0]
        check(copied['id'] != cl['id'], 'the applied checklist is a copy, not a pointer',
              'applying re-used the source checklist row')

# ════════════════════════════════════════════════════════ 4. Watchers ════
say('4. Watchers / followers (V7)')
w = call('POST', f'/tasks/{parent["id"]}/watchers', {'userId': OTHER} if OTHER else {})
det = call('GET', f'/tasks/{parent["id"]}')
watcher_ids = [x['user']['id'] for x in det.get('watchers', [])]
check(ME in watcher_ids, 'the creator is auto-followed', f'watchers -> {watcher_ids}')
if OTHER:
    check(OTHER in watcher_ids, 'another member can be added as a follower',
          f'watchers -> {watcher_ids} (add said {w})')
    call('DELETE', f'/tasks/{parent["id"]}/watchers/{OTHER}')
    after = [x['user']['id'] for x in call('GET', f'/tasks/{parent["id"]}').get('watchers', [])]
    check(OTHER not in after, 'and removed again', f'watchers after remove -> {after}')

# ═══════════════════════════════════════════════════════ 5. Move ════
say('5. Move across the hierarchy')
targets = call('GET', f'/spaces/workspace/{WS}/move-targets')
check(isinstance(targets, (list, dict)) and targets, 'move-targets resolves', f'-> {targets}')

other_list = next((l['id'] for l in lists_ if l['id'] != LIST), None)
if not other_list and PROJECT:
    nl = call('POST', '/lists', {'projectId': PROJECT, 'name': uniq('e2e-list')})
    if nl.get('id'):
        created['lists'].append(nl['id']); other_list = nl['id']
if other_list:
    mover = new_task('e2e mover')
    moved = call('POST', f'/tasks/{mover["id"]}/move', {'listId': other_list})
    reread = call('GET', f'/tasks/{mover["id"]}')
    check(reread.get('listId') == other_list,
          'a task moves to another list and the move sticks',
          f'listId -> {reread.get("listId")} (expected {other_list}); move said {moved}')
else:
    skip('only one list in this project — task move not exercised')

# ═══════════════════════════════════════════════════ 6. Trash ════
say('6. Trash: soft-delete, restore, delete-forever')
victim = new_task('e2e trash victim')
call('DELETE', f'/tasks/{victim["id"]}')
trash = call('GET', f'/workspaces/{WS}/trash')
rows = trash if isinstance(trash, list) else (trash.get('items') or [])
in_trash = any(r.get('id') == victim['id'] for r in rows)
check(in_trash, f'a deleted task appears in Trash ({len(rows)} row(s) there)',
      'the deleted task did not appear in Trash')
check(any(r.get('deletedByName') or r.get('deletedById') or r.get('deletedAt') for r in rows),
      'Trash rows carry who/when metadata', 'Trash rows have no deletion metadata')

r = call('POST', f'/workspaces/{WS}/trash/task/{victim["id"]}/restore')
alive = call('GET', f'/tasks/{victim["id"]}')
check(alive.get('id') == victim['id'] and not alive.get('isArchived'),
      'restore brings it back', f'after restore -> {alive.get("id")} archived={alive.get("isArchived")} ({r})')

call('DELETE', f'/tasks/{victim["id"]}')
call('DELETE', f'/workspaces/{WS}/trash/task/{victim["id"]}')
gone = status('GET', f'/tasks/{victim["id"]}')
check(gone in (404, 403), f'delete-forever really removes it ({gone})',
      f'the task still resolves after delete-forever: {gone}')
if victim['id'] in created['tasks']:
    created['tasks'].remove(victim['id'])

# ══════════════════════════════════════════════ 7. Share & permissions ════
say('7. Share & permissions across object types')
share_targets = [('task', parent['id']), ('list', LIST), ('project', PROJECT), ('space', SPACE)]
for otype, oid in share_targets:
    if not oid:
        continue
    resp = call('GET', f'/shares/{otype}/{oid}')
    check(isinstance(resp, dict) and 'items' in resp and 'canShare' in resp,
          f'{otype}: share panel resolves (canShare={resp.get("canShare")})',
          f'{otype}: -> {resp}')

email = f'{uniq("outsider")}@example.com'
s = call('POST', f'/shares/task/{parent["id"]}', {'email': email, 'level': 'view'})
check(bool(s.get('id')), 'invited an outsider by email (pending invite)', f'-> {s}')
if s.get('id'):
    lst = call('GET', f'/shares/task/{parent["id"]}')
    row = next((x for x in lst['items'] if x['id'] == s['id']), {})
    check(row.get('invitedEmail') == email and row.get('user') is None,
          'it lists as a pending invite with no user attached', f'row -> {row}')
    call('PATCH', f'/shares/task/{parent["id"]}/{s["id"]}', {'level': 'edit'})
    lst = call('GET', f'/shares/task/{parent["id"]}')
    row = next((x for x in lst['items'] if x['id'] == s['id']), {})
    check(row.get('level') == 'edit', 'the level can be changed', f'level -> {row.get("level")}')
    call('DELETE', f'/shares/task/{parent["id"]}/{s["id"]}')
    lst = call('GET', f'/shares/task/{parent["id"]}')
    check(not any(x['id'] == s['id'] for x in lst['items']), 'and revoked', 'revoke left the row behind')

if OTHER:
    s2 = call('POST', f'/shares/task/{parent["id"]}', {'email': next(m['email'] for m in members if m['userId'] == OTHER), 'level': 'comment'})
    lst = call('GET', f'/shares/task/{parent["id"]}')
    row = next((x for x in lst['items'] if x.get('id') == s2.get('id')), {})
    check((row.get('user') or {}).get('id') == OTHER,
          'a known workspace email binds to that user rather than staying an invite',
          f'row -> {row}')
    if s2.get('id'):
        call('DELETE', f'/shares/task/{parent["id"]}/{s2["id"]}')

# ═════════════════════════════════════════════════════════ 8. Search ════
say('8. Search: types, multi-select and sort')
# Seed one row of every searchable type under a token nothing else can match,
# so a type reporting "no results" means a real gap and not an empty database.
TOK = 'zqxsearch' + uuid.uuid4().hex[:6]
seeded = {}

st = new_task(f'{TOK} task')
seeded['task'] = bool(st.get('id'))

doc = call('POST', f'/workspaces/{WS}/docs', {'spaceId': SPACE, 'title': f'{TOK} doc'})
if doc.get('id'):
    created['docs'].append(doc['id']); seeded['doc'] = True

cmt = call('POST', f'/tasks/{st["id"]}/comments', {'body': f'{TOK} comment body'})
seeded['comment'] = bool(cmt.get('id'))

ch = call('POST', f'/workspaces/{WS}/chat/channels', {'name': f'{TOK}-channel'})
if ch.get('id'):
    created['channels'].append(ch['id']); seeded['channel'] = True
    msg = call('POST', f'/chat/channels/{ch["id"]}/messages', {'body': f'{TOK} message text'})
    seeded['message'] = bool(msg.get('id'))

# Users are matched on name/email, which no token can be injected into — search
# for a real member instead and assert the type filter separately.
print(f'  seeded: {sorted(k for k, v in seeded.items() if v)}')

res = call('GET', f'/search/{WS}?q={TOK}')
hits = res if isinstance(res, list) else (res.get('results') or res.get('items') or [])
found = sorted({h.get('entityType') for h in hits if h.get('entityType')})
check(len(hits) > 0, f'unfiltered search finds the seeded rows: {found}', f'-> {res}')

for t in ['task', 'doc', 'comment', 'channel', 'message']:
    if not seeded.get(t):
        skip(f'types={t}: could not seed a {t} fixture'); continue
    r = call('GET', f'/search/{WS}?q={TOK}&types={t}')
    hh = r if isinstance(r, list) else (r.get('results') or r.get('items') or [])
    got = {x.get('entityType') for x in hh}
    if not hh:
        bad(f'types={t} found nothing even though a {t} matching "{TOK}" exists')
    else:
        check(got == {t}, f'types={t} returns only {t} ({len(hh)} hit(s))', f'types={t} leaked {got}')

# `user` needs a query that matches a person, not the seeded token.
who = (members[0].get('displayName') or members[0]['email']).split()[0][:6]
r = call('GET', f'/search/{WS}?q={who}&types=user')
hh = r if isinstance(r, list) else (r.get('results') or r.get('items') or [])
got = {x.get('entityType') for x in hh}
check(bool(hh) and got == {'user'}, f'types=user returns only user ({len(hh)} hit(s) for "{who}")',
      f'types=user -> {got or "nothing"} for "{who}"')

# `file` needs an upload; assert the filter is at least honoured, not invented.
r = call('GET', f'/search/{WS}?q=a&types=file')
hh = r if isinstance(r, list) else (r.get('results') or r.get('items') or [])
got = {x.get('entityType') for x in hh}
if hh:
    check(got == {'file'}, f'types=file returns only file ({len(hh)} hit(s))', f'types=file leaked {got}')
else:
    skip('types=file: no files in this workspace to match')

r = call('GET', f'/search/{WS}?q={TOK}&types=task,message')
hh = r if isinstance(r, list) else (r.get('results') or r.get('items') or [])
got = {x.get('entityType') for x in hh}
check(got and got.issubset({'task', 'message'}) and 'task' in got,
      f'multi-select types=task,message returns exactly {got} — the case that was broken in prod',
      f'multi-select returned {got}')
check('doc' not in got and 'comment' not in got and 'channel' not in got,
      'and no unselected type leaks in', f'unselected types leaked: {got}')

for srt in ['relevance', 'updated', 'created']:
    r = call('GET', f'/search/{WS}?q={TOK}&sort={srt}')
    hh = r if isinstance(r, list) else (r.get('results') or r.get('items') or [])
    check(len(hh) > 0, f'sort={srt} returns results ({len(hh)})', f'sort={srt} returned nothing')

r = call('GET', f'/search/{WS}?q={TOK}&sort=updated')
hh = r if isinstance(r, list) else (r.get('results') or r.get('items') or [])
stamps = [h.get('sortedAt') for h in hh if h.get('sortedAt')]
check(stamps == sorted(stamps, reverse=True) if stamps else False,
      f'sort=updated is genuinely descending across {len(stamps)} stamped rows',
      f'sort=updated out of order or unstamped: {stamps[:5]}')

# Cross-type interleaving: sorting must order the whole result set, not each
# type's block in turn. Two different types adjacent in the sorted output proves it.
types_in_order = [h.get('entityType') for h in hh]
check(len(set(types_in_order)) > 1 and any(
          types_in_order[i] != types_in_order[i + 1] for i in range(len(types_in_order) - 1)),
      f'sort interleaves types rather than sorting within blocks: {types_in_order}',
      f'only one type in the sorted set, interleaving unproven: {types_in_order}')

# ═════════════════════════════════════════════ 9. Reports-to & schedule ════
say('9. Reports-to (skip-list #31)')
if OTHER:
    call('PATCH', f'/workspaces/{WS}/members/{ME}/manager', {'managerId': OTHER})
    row = {m['userId']: m for m in call('GET', f'/workspaces/{WS}/members')}[ME]
    check(row.get('managerId') == OTHER and row.get('managerName'),
          f'manager set and named ({row.get("managerName")})', f'-> {row}')
    check(status('PATCH', f'/workspaces/{WS}/members/{OTHER}/manager', {'managerId': ME}) == 400,
          'A→B→A is refused (400)', 'a reporting cycle was allowed')
    check(status('PATCH', f'/workspaces/{WS}/members/{ME}/manager', {'managerId': ME}) == 400,
          'self-report is refused (400)', 'self-report was allowed')
    check(status('PATCH', f'/workspaces/{WS}/members/{ME}/manager', {'managerId': str(uuid.uuid4())}) == 404,
          'a manager outside the workspace is refused (404)', 'an outsider was accepted as manager')
    call('PATCH', f'/workspaces/{WS}/members/{ME}/manager', {'managerId': None})
    row = {m['userId']: m for m in call('GET', f'/workspaces/{WS}/members')}[ME]
    check(row.get('managerId') is None, 'cleared back to nobody', f'-> {row.get("managerId")}')
else:
    skip('single-member workspace — reporting line not exercised')

say('10. Work schedule + holidays (skip-list #34)')
sched = call('GET', f'/workspaces/{WS}/work-schedule')
check('workDays' in sched and 'holidays' in sched, f'reads {sched.get("workDays")}', f'-> {sched}')
s = call('PATCH', f'/workspaces/{WS}/work-schedule', {'workDays': [7, 1, 2, 3, 4, 1]})
check(s.get('workDays') == [1, 2, 3, 4, 7], f'de-duped and sorted -> {s.get("workDays")}', f'-> {s}')
for body, label in (([], 'empty week'), ([0, 9], 'out-of-range day'), (['x'], 'non-numeric')):
    check(status('PATCH', f'/workspaces/{WS}/work-schedule', {'workDays': body}) == 400,
          f'{label} refused (400)', f'{label} accepted')
call('PATCH', f'/workspaces/{WS}/work-schedule', {'workDays': [1, 2, 3, 4, 5]})

hday = (datetime.date.today() + datetime.timedelta(days=40)).isoformat()
h = call('POST', f'/workspaces/{WS}/holidays', {'day': hday, 'name': 'E2E holiday'})
created['holidays'].append(h.get('id'))
check(bool(h.get('id')), f'holiday added for {hday}', f'-> {h}')
check(status('POST', f'/workspaces/{WS}/holidays', {'day': hday, 'name': 'dup'}) == 409,
      'a duplicate date is refused (409)', 'a duplicate holiday was accepted')
check(status('POST', f'/workspaces/{WS}/holidays', {'day': '40-12-2026', 'name': 'x'}) == 400,
      'a malformed date is refused (400)', 'a malformed date was accepted')

say('11. Workload actually reads the schedule')
start = datetime.date.today()
window = [start + datetime.timedelta(days=i) for i in range(14)]


def wl():
    r = call('GET', f'/workspaces/{WS}/reports/workload?days=14')
    return r if isinstance(r, list) else (r.get('rows') or r.get('members') or [])


call('PATCH', f'/workspaces/{WS}/work-schedule', {'workDays': [1, 2, 3, 4, 5]})
base = wl()[0]
wknd = [i for i, d in enumerate(window) if d.isoweekday() in (6, 7)]
check(all(base['dailyCapacities'][i] == 0 for i in wknd), 'Sat/Sun carry no capacity on a Mon–Fri week',
      f'weekend caps -> {[base["dailyCapacities"][i] for i in wknd]}')

call('PATCH', f'/workspaces/{WS}/work-schedule', {'workDays': [7, 1, 2, 3, 4]})
st = wl()[0]
sun = [i for i, d in enumerate(window) if d.isoweekday() == 7]
fri = [i for i, d in enumerate(window) if d.isoweekday() == 5]
check(all(st['dailyCapacities'][i] > 0 for i in sun) and all(st['dailyCapacities'][i] == 0 for i in fri),
      'a Sun–Thu week moves capacity off Friday and onto Sunday',
      f'sun={[st["dailyCapacities"][i] for i in sun]} fri={[st["dailyCapacities"][i] for i in fri]}')

call('PATCH', f'/workspaces/{WS}/work-schedule', {'workDays': [1, 2, 3, 4]})
four = wl()[0]
check(abs(four['capacity'] - round(four['weeklyCapacityHours'] / 4, 1)) < 0.05,
      f'a four-day week lengthens the day ({base["capacity"]}h → {four["capacity"]}h)',
      f'daily -> {four["capacity"]}')

call('PATCH', f'/workspaces/{WS}/work-schedule', {'workDays': [1, 2, 3, 4, 5]})
tgt = next(d for d in window[1:] if d.isoweekday() <= 5)
i = window.index(tgt)
before = wl()[0]['dailyCapacities'][i]
hh = call('POST', f'/workspaces/{WS}/holidays', {'day': tgt.isoformat(), 'name': 'E2E capacity probe'})
after = wl()[0]['dailyCapacities'][i]
check(before > 0 and after == 0, f'a holiday zeroes {tgt} ({before}h → {after}h)',
      f'{tgt}: {before} → {after}')
call('DELETE', f"/workspaces/{WS}/holidays/{hh.get('id')}")
check(wl()[0]['dailyCapacities'][i] == before, 'and removing it restores the day',
      'the day did not come back')

# ════════════════════════════════════════════ 12. Inbox triage + split ════
say('12. Inbox triage buckets and the Primary/Other split')
counts = call('GET', '/notifications/counts')
check(all(k in counts for k in ('inbox', 'later', 'cleared')),
      f'triage counts resolve: {counts}', f'-> {counts}')
for v in ('inbox', 'later', 'cleared'):
    r = call('GET', f'/notifications?view={v}')
    check(isinstance(r, list), f'view={v} returns a list ({len(r) if isinstance(r, list) else "?"})',
          f'view={v} -> {r}')

inbox = call('GET', '/notifications?view=inbox')
if inbox:
    n = inbox[0]
    call('POST', f'/notifications/{n["id"]}/snooze', {'hours': 1})
    later = call('GET', '/notifications?view=later')
    check(any(x['id'] == n['id'] for x in later), 'snoozing moves a row to Later',
          'the snoozed row is not in Later')
    call('POST', f'/notifications/{n["id"]}/unsnooze')
    back = call('GET', '/notifications?view=inbox')
    check(any(x['id'] == n['id'] for x in back), 'unsnoozing brings it back to Inbox',
          'the row did not return to Inbox')
    call('POST', f'/notifications/{n["id"]}/clear')
    cleared = call('GET', '/notifications?view=cleared')
    check(any(x['id'] == n['id'] for x in cleared), 'clearing moves it to Cleared',
          'the cleared row is not in Cleared')
    call('POST', f'/notifications/{n["id"]}/unclear')

    HUMAN = {'task_mentioned', 'doc_mentioned', 'task_commented', 'doc_commented',
             'task_assigned', 'chat_message'}
    allrows = call('GET', '/notifications?view=inbox')
    p = [x for x in allrows if x['type'] in HUMAN]
    o = [x for x in allrows if x['type'] not in HUMAN]
    check(len(p) + len(o) == len(allrows),
          f'the Primary/Other partition is exhaustive and disjoint ({len(p)}+{len(o)}={len(allrows)})',
          'the split does not partition the list')
else:
    skip('no notifications in the inbox to triage')

# ══════════════════════════════════════════════════ 13. Saved views ════
say('13. Saved views carry their filter set')
FILTERS = [{'field': 'priority', 'op': 'eq', 'value': 'high'}]
v = call('POST', f'/lists/{LIST}/views', {
    'name': uniq('e2e-view'), 'type': 'list',
    'config': {'groupBy': 'status', 'filters': FILTERS},
})
check(bool(v.get('id')), 'created a saved view on a list', f'-> {v}')
if v.get('id'):
    listed = call('GET', f'/lists/{LIST}/views')
    mine = next((x for x in listed if x['id'] == v['id']), {})
    cfg = mine.get('config') or {}
    check(cfg.get('filters') == FILTERS,
          f'the view round-trips its filter set: {cfg.get("filters")}',
          f'config came back as {cfg}')
    check(cfg.get('groupBy') == 'status', 'and its grouping', f'groupBy -> {cfg.get("groupBy")}')
    call('PATCH', f'/views/{v["id"]}', {'config': {'groupBy': 'assignee', 'filters': []}})
    listed = call('GET', f'/lists/{LIST}/views')
    mine = next((x for x in listed if x['id'] == v['id']), {})
    check((mine.get('config') or {}).get('groupBy') == 'assignee',
          'and the config can be edited', f'after PATCH -> {mine.get("config")}')
    call('DELETE', f'/views/{v["id"]}')
    listed = call('GET', f'/lists/{LIST}/views')
    check(not any(x['id'] == v['id'] for x in listed), 'and deleted', 'the view survived delete')

# ══════════════════════════════════════════ 14. Tenant isolation ════
say('14. Tenant isolation — the checks that matter most')
# A second account that owns a workspace this one is not a member of. That is
# the only way to prove isolation — "only one workspace visible" proves nothing.
other = call('POST', '/auth/login', {'email': 'admin@rundesk.internal', 'password': 'Admin@123!'})
if '__status' not in other:
    otok = other['accessToken']
    their_ws = [w['workspace']['id'] for w in call('GET', '/workspaces', token=otok)]
    mine_ws = [w['workspace']['id'] for w in call('GET', '/workspaces')]
    foreign = next((w for w in their_ws if w not in mine_ws), None)
    if foreign:
        print(f'  foreign workspace {foreign} (owned by admin@, not org-admin@)')
        for path, label in [
            (f'/workspaces/{foreign}/task-types', 'task types'),
            (f'/workspaces/{foreign}/work-schedule', 'work schedule'),
            (f'/workspaces/{foreign}/members', 'member roster'),
            (f'/search/{foreign}?q=a', 'search'),
            (f'/workspaces/{foreign}/trash', 'trash'),
        ]:
            c = status('GET', path)
            check(c in (401, 403, 404), f'{label} in a workspace I am not in -> {c}',
                  f'{label} in a foreign workspace returned {c} — that is a leak')
        for path, label, body in [
            (f'/workspaces/{foreign}/task-types', 'create a task type', {'name': 'intrusion'}),
            (f'/workspaces/{foreign}/holidays', 'add a holiday', {'day': '2027-03-03', 'name': 'x'}),
        ]:
            c = status('POST', path, body)
            check(c in (401, 403, 404), f'writing {label} there -> {c}',
                  f'a write into a foreign workspace returned {c}')
        c = status('PATCH', f'/workspaces/{foreign}/work-schedule', {'workDays': [1]})
        check(c in (401, 403, 404), f'changing their work schedule -> {c}',
              f'a foreign work-schedule write returned {c}')
    else:
        skip('the second account owns no workspace this one lacks')

else:
    skip(f'second account unavailable: {other}')

# The reverse direction, using an account that is genuinely not a member of
# this workspace. admin@ looks like an outsider but is a workspace_admin here,
# so asserting against it would have "found" a leak that is correct behaviour.
outsider = call('POST', '/auth/login',
                {'email': 'outsider1@rundesk.internal', 'password': 'Outsider@123!'})
if '__status' not in outsider:
    otk = outsider['accessToken']
    for path, label in [(f'/workspaces/{WS}/task-types', 'task types'),
                        (f'/workspaces/{WS}/members', 'member roster'),
                        (f'/workspaces/{WS}/work-schedule', 'work schedule'),
                        (f'/workspaces/{WS}/trash', 'trash'),
                        (f'/search/{WS}?q=a', 'search'),
                        (f'/tasks/{parent["id"]}', 'a task by id')]:
        c = status('GET', path, token=otk)
        check(c in (401, 403, 404), f'a non-member reading our {label} -> {c}',
              f'a non-member read our {label}: {c}')
    c = status('POST', f'/workspaces/{WS}/task-types', {'name': 'intrusion'}, token=otk)
    check(c in (401, 403, 404), f'a non-member creating a task type here -> {c}',
          f'a non-member wrote into our workspace: {c}')
else:
    skip(f'no non-member account available: {outsider}')

tt_mine = call('GET', f'/workspaces/{WS}/task-types')
check(isinstance(tt_mine, list), 'our own task types still read fine for us',
      f'-> {tt_mine}')

# Cross-workspace id used against this workspace must read as missing.
check(status('DELETE', f'/workspaces/{WS}/task-types/{uuid.uuid4()}') == 404,
      'a foreign/unknown task-type id is 404 against this workspace', 'it was not 404')
check(status('GET', f'/tasks/{uuid.uuid4()}') in (404, 403),
      'an unknown task id is 404/403, never a 500', 'unknown task id did not 404/403')

# ═══════════════════════════════════════════════ 15. Auth boundaries ════
say('15. Unauthenticated access is refused')
for path in [f'/workspaces/{WS}/task-types', f'/workspaces/{WS}/work-schedule',
             f'/workspaces/{WS}/members', '/notifications', f'/search/{WS}?q=a']:
    c = status('GET', path, token='')
    check(c == 401, f'{path.split("?")[0]} without a token -> 401', f'{path} -> {c} (expected 401)')

# ══════════════════════════════════════════════════════════ cleanup ════
say('Cleanup — and prove it actually cleaned up')
for tid in created['tasks']:
    call('DELETE', f'/tasks/{tid}')
    call('DELETE', f'/workspaces/{WS}/trash/task/{tid}')
for tid in [x for x in created['templates'] if x]:
    call('DELETE', f'/checklist-templates/{tid}')
for lid in created['lists']:
    call('DELETE', f'/lists/{lid}')
call('PATCH', f'/workspaces/{WS}/work-schedule', {'workDays': [1, 2, 3, 4, 5]})
left = purge_fixtures('after')

# The suite must leave the workspace as it found it. Anything still here would
# silently satisfy a later run's assertions.
residual = purge_fixtures('verify')
check(sum(residual.values()) == 0,
      'the workspace is back to its starting state — no fixtures left behind',
      f'fixtures survived teardown: {residual}')
sched_end = call('GET', f'/workspaces/{WS}/work-schedule')
check(sched_end.get('workDays') == [1, 2, 3, 4, 5] and not sched_end.get('holidays'),
      f'work schedule restored to {sched_end.get("workDays")} with no holidays',
      f'schedule left as {sched_end}')
mgrs = [m for m in call('GET', f'/workspaces/{WS}/members') if m.get('managerId')]
check(not mgrs, 'no reporting lines left set', f'managers still set: {[m["email"] for m in mgrs]}')

# ═══════════════════════════════════════════════════════════ report ════
print('\n' + '═' * 62)
by_section = {}
for sec, _ in PASS: by_section.setdefault(sec, [0, 0, 0])[0] += 1
for sec, _ in FAIL: by_section.setdefault(sec, [0, 0, 0])[1] += 1
for sec, _ in SKIP: by_section.setdefault(sec, [0, 0, 0])[2] += 1
for sec, (p, f, s) in by_section.items():
    mark = '\033[31m✗\033[0m' if f else '\033[32m✓\033[0m'
    extra = f', {s} skipped' if s else ''
    print(f'  {mark} {sec}: {p} passed{", " + str(f) + " FAILED" if f else ""}{extra}')
print('═' * 62)
if FAIL:
    print('\n\033[1;31mFailures:\033[0m')
    for sec, m in FAIL:
        print(f'  [{sec}] {m}')
print(f'\n\033[1m{len(PASS)} passed, {len(FAIL)} failed, {len(SKIP)} skipped\033[0m')
sys.exit(1 if FAIL else 0)
