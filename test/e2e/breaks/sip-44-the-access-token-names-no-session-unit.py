# THE ACCESS TOKEN NAMES NO SESSION AGAIN (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# `sid` is left out of the access token, so nothing can ask whether its session
# is live (and `JwtStrategy`, which refuses a token naming none, refuses every
# token: a lane measures nothing past sign-in, so this is claimed by the unit
# test alone).
#
# Reddens: unit: auth.service.test.ts "login names its session in the access token: sid is the id of the session row it writes"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = "      sid: sessionId,\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-44-the-access-token-names-no-session-unit: the access token names no session')
