# THE SESSION CHECK READS A ROW BY ITS PERSON, NOT BY THE SESSION THE TOKEN NAMES (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# `sessionIsLive` looks up the first session of the token's person, whichever
# it is, so whether a token is let in depends on another session of the same
# person: a revoked one may read on while a sibling lives, and a live one be
# refused beside a revoked sibling (unit only: on a lane which row comes first
# is the planner's choice, so a check of it would measure the planner).
#
# Reddens: unit: jwt.strategy.test.ts "validate answers the person while the session the token names is live, reading it once by its id"
import io
p = '/home/user/rundesk/apps/api/src/common/security/live-session.ts'
a = "    .where(eq(sessions.id, sid))\n"
b = "    .where(eq(sessions.userId, sub))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-55-a-session-is-read-by-its-person-unit: the session check reads a row by its person')
