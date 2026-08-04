"""A3.9 shared-with endpoint: the DM Calendar and Tasks tabs, end to end."""
import json, urllib.request, urllib.error

API  = 'http://127.0.0.1:3001/api/v1'
WS   = 'f47622b5-fc76-47d0-82d4-3b68c00bbaed'
ME   = '5b57bd3a-9bdc-4e38-a575-e1aa6a975c3a'
PEER = '3012755b-5d92-4769-8466-e28a698e75ca'
LIST = 'e0e94446-58df-4f61-a221-976038e27f3f'

R = []
def ok(m):  R.append(1); print(f'  \033[32mPASS\033[0m {m}')
def bad(m): R.append(0); print(f'  \033[31mFAIL\033[0m {m}')
def chk(c, g, b): ok(g) if c else bad(b)

def call(method, path, body=None, tok=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if tok: req.add_header('Authorization', 'Bearer ' + tok)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b'{}')
        except Exception: return e.code, {}
    except Exception as ex:
        return 0, {'error': str(ex)}

tok  = call('POST','/auth/login',{'email':'verify@rundesk.internal','password':'Verify@123!'})[1]['data']['accessToken']
_ps, _pb = call('POST','/auth/login',{'email':'colleague7983@rundesk.internal','password':'Verify@123!'})
ptok = ((_pb or {}).get('data') or {}).get('accessToken')
print(f'  peer login {_ps} token={"yes" if ptok else "no"}')

print('\n▶ seeding tasks')
so, open_t = call('POST', '/tasks', {'listId':LIST,'title':'A39 open task for the pair','assigneeIds':[PEER]}, tok)
sd, done_t = call('POST', '/tasks', {'listId':LIST,'title':'A39 finished task (must be hidden)','assigneeIds':[PEER]}, tok)
assert open_t.get('data'), f'create failed {so}: {json.dumps(open_t)[:200]}'
assert done_t.get('data'), f'create failed {sd}: {json.dumps(done_t)[:200]}'
open_id = open_t['data']['id']
done_id = done_t['data']['id']
s, _ = call('PATCH', f'/tasks/{done_id}', {'status':'done','statusCategory':'closed'}, tok)
print(f'  open={open_id[:8]} done={done_id[:8]} (patch {s})')

print('\n▶ GET /workspaces/:ws/people/:peer/shared')
s, res = call('GET', f'/workspaces/{WS}/people/{PEER}/shared', None, tok)
chk(s == 200, 'the endpoint answers 200', f'status {s}: {json.dumps(res)[:160]}')
d = res.get('data') or {}
meets = d.get('meetings', [])
tsks  = d.get('tasks', [])
mt = [m['title'] for m in meets]
tt = [t['title'] for t in tsks]
print(f'  meetings={mt}')
print(f'  tasks={tt}')

chk(any('Sprint sync' in x for x in mt), 'the meeting both attended is returned', f'shared meeting missing: {mt}')
chk(not any('Solo planning' in x for x in mt),
    'a meeting only one of us attended is NOT returned', f'a solo meeting leaked into the shared list: {mt}')
chk(any('open task for the pair' in x for x in tt), 'the open task is returned', f'open task missing: {tt}')
chk(not any('finished task' in x for x in tt),
    'a closed task is NOT returned — the tab says "open"', f'a closed task leaked in: {tt}')
chk(all('startsAt' in m and 'provider' in m for m in meets),
    'meetings carry the fields the panel renders', 'a meeting row is missing startsAt/provider')

print('\n▶ refusals')
s, res = call('GET', f'/workspaces/{WS}/people/{ME}/shared', None, tok)
chk(s == 400, 'asking what you share with yourself is refused', f'status {s}')
s, res = call('GET', f'/workspaces/{WS}/people/00000000-0000-0000-0000-000000000000/shared', None, tok)
chk(s == 404, 'a stranger to the workspace is 404, not an empty answer', f'status {s}')
s, res = call('GET', f'/workspaces/{WS}/people/{PEER}/shared', None, None)
chk(s == 401, 'no token is 401', f'status {s}')

# The colleague is a member of the *other* workspace too; asking about this one
# from their own token must still be scoped to membership.
if ptok:
    s, res = call('GET', f'/workspaces/{WS}/people/{ME}/shared', None, ptok)
    chk(s == 200, 'the other side sees the same pair', f'status {s}')
    back = [m['title'] for m in (res.get('data') or {}).get('meetings', [])]
    chk(sorted(back) == sorted(mt), 'the shared list is symmetric', f'{back} != {mt}')
else:
    print('  \033[33mSKIP\033[0m peer login unavailable (password unknown)')

f = R.count(0)
print(f'\n{R.count(1)} passed, {f} failed')
raise SystemExit(1 if f else 0)
