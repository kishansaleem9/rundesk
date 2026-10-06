# THE SESSION AN ACCESS TOKEN NAMES IS NOT READ FROM IT, asked of the strategy itself.
# Reddens: unit: jwt.strategy.test.ts "validate answers the person while the session the token names is live, reading it once by its id"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/strategies/jwt.strategy.ts'
a = "      sid: typeof payload.sid === 'string' ? payload.sid : undefined,\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-74-the-token-s-session-is-not-read-unit: jwt.strategy.ts: the person a request answers to carries no session id.')
