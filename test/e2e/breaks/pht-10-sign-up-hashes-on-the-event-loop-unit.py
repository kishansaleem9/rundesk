# SIGN-UP HASHES ON THE API'S ONE THREAD AGAIN (`found-30-sep/password-hash-holds-the-event-loop`).
#
# Sign-up goes back to bcryptjs's `hashSync(…, 12)`, as it was: about 300 ms of
# the event loop per account made, while nobody else is answered.
#
# Reddens: unit: password-hash.test.ts "no module of the API but this one imports bcryptjs, so no hash runs on the event loop"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = "    const passwordHash = await passwords.hash(dto.password)\n"
b = "    const passwordHash = (require('bcryptjs') as typeof import('bcryptjs')).hashSync(dto.password, 12)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pht-10-sign-up-hashes-on-the-event-loop-unit: sign-up hashes with hashSync')
