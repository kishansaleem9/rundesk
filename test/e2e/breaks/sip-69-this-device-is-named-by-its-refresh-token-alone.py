# THE SESSIONS LIST ASKS ONLY A REFRESH TOKEN WHICH ROW IS THIS DEVICE again: a page reloaded from
# its cookies holds none in memory, and no row is.
# Reddens: sign-in-and-password: "the sessions list read by a browser’s cookies alone, as after a reload, marks one session as this device — the same one its access token names when read by it, no refresh token in the query"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = '          (Boolean(currentSessionId) && row.id === currentSessionId) ||\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-69-this-device-is-named-by-its-refresh-token-alone: auth.service.ts: the sessions list asks only the refresh token which session is this device.')
