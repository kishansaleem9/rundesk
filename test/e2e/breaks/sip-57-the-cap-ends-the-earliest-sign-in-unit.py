# THE SESSION CAP ENDS THE EARLIEST SIGN-IN, READ FROM THE SERVICE (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# `sip-56`'s edit, claimed by the unit test: the cap orders the live sessions
# by `created_at`.
#
# Reddens: unit: auth.service.test.ts "the session cap ends the sessions used least recently: the live ones ordered by the window each refresh extends, not by when they signed in"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = "      .orderBy(desc(sessions.expiresAt))\n"
b = "      .orderBy(desc(sessions.createdAt))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-57-the-cap-ends-the-earliest-sign-in-unit: the cap orders the sessions by when they signed in')
