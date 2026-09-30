# THE SESSION CAP ENDS THE EARLIEST SIGN-IN, NOT THE SESSION USED LEAST RECENTLY (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# The cap orders the live sessions by when their row was made, as it did while
# every refresh made a new row. A refresh keeps its row now, so that is when
# the session signed in: a new sign-in past the cap ends a session in daily use
# before one left idle since.
#
# Reddens: sign-in-and-password:
#   "the session cap ends the session used least recently: one refreshed after another’s sign-in outlives it when a new sign-in passes the cap"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = "      .orderBy(desc(sessions.expiresAt))\n"
b = "      .orderBy(desc(sessions.createdAt))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-56-the-cap-ends-the-earliest-sign-in: the cap orders the sessions by when they signed in')
