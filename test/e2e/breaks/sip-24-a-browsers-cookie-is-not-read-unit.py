# A PASSWORD CHANGE READS NO REFRESH COOKIE, READ FROM THE CONTROLLER (`found-30-sep/password-change-unthrottled`).
#
# `sip-22`'s edit, claimed by the unit test: a browser's refresh cookie is not
# handed to the service as the session to keep.
#
# Reddens: unit: users.controller.test.ts "a browser’s session is the one its refresh cookie names, when the body names none"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.controller.ts'
a = "    const keep = named ?? req.cookies?.[REFRESH_TOKEN_COOKIE] ?? null\n"
b = "    const keep = named ?? (req.cookies?.[REFRESH_TOKEN_COOKIE] ? null : null)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-24-a-browsers-cookie-is-not-read-unit: the refresh cookie names no session')
