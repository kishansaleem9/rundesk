# A CONNECTION WITH NO TOKEN IS PASSED OVER BEFORE ITS OWNER IS ASKED: the owner rule is never asked of it.
# Reddens: unit: external-links.test.ts "asks whose the connection is before its token: one whose owner may open the task, with no token, is still told to connect first"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (!conn || conn.status !== 'connected') return null\n    return {\n      id: conn.id,\n      accessToken: conn.accessToken ?? null,\n"
b = "    if (!conn || conn.status !== 'connected' || !conn.accessToken) return null\n    return {\n      id: conn.id,\n      accessToken: conn.accessToken ?? null,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('els-3-the-token-before-the-owner-unit: the token is asked before the owner')
