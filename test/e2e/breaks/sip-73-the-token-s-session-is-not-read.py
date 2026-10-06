# THE SESSION AN ACCESS TOKEN NAMES IS NOT READ FROM IT: neither the sessions list nor a password
# change knows which session is the caller’s.
# Reddens: sign-in-and-password:
#   "the sessions list read by a browser’s cookies alone, as after a reload, marks one session as this device — the same one its access token names when read by it, no refresh token in the query"
#   "a client that names no session keeps its own through its own password change — it reads on — and the other session is refused 401"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/strategies/jwt.strategy.ts'
a = "      sid: typeof payload.sid === 'string' ? payload.sid : undefined,\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-73-the-token-s-session-is-not-read: jwt.strategy.ts: the person a request answers to carries no session id.')
