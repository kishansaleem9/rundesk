# A PASSWORD CHANGE KEEPS ONLY THE SESSION A REFRESH TOKEN NAMES again: a client that names none
# signs itself out by its own change.
# Reddens: sign-in-and-password: "a client that names no session keeps its own through its own password change — it reads on — and the other session is refused 401"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = '            ...(keepSessionId ? [ne(sessions.id, keepSessionId)] : []),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-72-a-password-change-keeps-only-a-refresh-token-s: users.service.ts: a password change keeps only the session a refresh token names.')
