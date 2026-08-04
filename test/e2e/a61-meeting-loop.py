"""A6.1 — the loop closes: a saved meeting's notes become tasks that say where they came from."""
import json, urllib.request, urllib.error

API  = 'http://127.0.0.1:3001/api/v1'
WS   = 'f47622b5-fc76-47d0-82d4-3b68c00bbaed'
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
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b'{}')
        except Exception: return e.code, {}
    except Exception as ex:
        return 0, {'error': str(ex)}

tok = call('POST','/auth/login',{'email':'verify@rundesk.internal','password':'Verify@123!'})[1]['data']['accessToken']

print('\n▶ a meeting with notes')
_, m = call('POST', f'/workspaces/{WS}/meetings', {
    'title': 'A61 loop meeting',
    'notes': 'Action items: Ali must write the DB migration by Thursday. '
             'Sara must review the CSV export path before Friday.',
    'recordingUrl': 'https://example.com/rec/loop.mp4',
}, tok)
mid = m['data']['id']
chk(m['data'].get('recordingUrl') == 'https://example.com/rec/loop.mp4',
    'create keeps the recording url', f"recordingUrl came back as {m['data'].get('recordingUrl')!r}")

print('\n▶ extract, without creating anything')
s, res = call('POST', f'/workspaces/{WS}/meetings/{mid}/action-items', {}, tok)
items = (res.get('data') or {}).get('items', [])
chk(s in (200, 201), 'the endpoint answers 2xx', f'status {s}: {json.dumps(res)[:200]}')
chk(len(items) >= 1, f'it found action items ({len(items)})', f'nothing extracted: {json.dumps(res)[:200]}')
chk((res.get('data') or {}).get('created') == [], 'nothing is created without a target list',
    'it created tasks nobody asked for')
print('  items:', [i.get('title') for i in items][:4])

print('\n▶ extract into a list')
s, res = call('POST', f'/workspaces/{WS}/meetings/{mid}/action-items', {'createIn': LIST}, tok)
created = (res.get('data') or {}).get('created', [])
chk(s in (200, 201) and len(created) >= 1, f'it created {len(created)} real tasks', f'status {s}: {json.dumps(res)[:200]}')

if created:
    _, full = call('GET', f"/tasks/{created[0]['id']}", None, tok)
    desc = (full.get('data') or {}).get('description') or ''
    chk('From meeting: A61 loop meeting' in desc,
        'each task says which meeting it came from', f'description was: {desc[:160]!r}')
    # The AI described these, so the origin must be appended rather than
    # standing in for a description that never existed.
    chk(len(desc.strip()) > len('From meeting: A61 loop meeting'),
        "the AI's own description is kept alongside the origin",
        f'the description is only the origin line: {desc[:160]!r}')

print('\n▶ refusals')
_, empty = call('POST', f'/workspaces/{WS}/meetings', {'title': 'A61 empty meeting'}, tok)
s, res = call('POST', f"/workspaces/{WS}/meetings/{empty['data']['id']}/action-items", {}, tok)
chk(s == 400, 'a meeting with no notes is refused, not silently empty', f'status {s}')
chk('no notes' in json.dumps(res).lower(), 'and it says why', f'message: {json.dumps(res)[:160]}')

f = R.count(0)
print(f'\n{R.count(1)} passed, {f} failed')
raise SystemExit(1 if f else 0)
