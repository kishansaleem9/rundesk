# SIGNING OUT THE OTHER SESSIONS KEEPS ONLY THE ONE A REFRESH TOKEN NAMES: a caller that names none
# is signed out with them.
# Reddens: unit: auth.service.test.ts "keeps the session the access token names when signing out the others, with no refresh token passed"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = '          s.id !== currentSessionId &&\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-71-sign-out-others-keeps-only-a-refresh-token-s-unit: auth.service.ts: signing out the others keeps only the session a refresh token names.')
