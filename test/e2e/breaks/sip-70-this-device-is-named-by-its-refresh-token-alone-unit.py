# THE SESSIONS LIST ASKS ONLY A REFRESH TOKEN WHICH ROW IS THIS DEVICE, asked of the service itself.
# Reddens: unit: auth.service.test.ts "marks the session the access token names as this device, with no refresh token passed"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = '          (Boolean(currentSessionId) && row.id === currentSessionId) ||\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-70-this-device-is-named-by-its-refresh-token-alone-unit: auth.service.ts: the sessions list asks only the refresh token which session is this device.')
