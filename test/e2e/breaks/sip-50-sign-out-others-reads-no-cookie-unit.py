# "SIGN OUT OTHER SESSIONS" READS THE BODY ALONE AGAIN, READ FROM THE CONTROLLER (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# `sip-49`'s edit, claimed by the unit test: a browser naming no session in the
# body keeps none.
#
# Reddens: unit: auth.controller.test.ts "“Sign out other sessions” keeps the session a browser’s refresh cookie names when the body names none, and one named in the body first"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.controller.ts'
a = "    return this.authService.revokeOtherSessions(user.id, named ?? req.cookies?.[REFRESH_TOKEN_COOKIE] ?? null)\n"
b = "    return this.authService.revokeOtherSessions(user.id, named ?? (req.cookies?.[REFRESH_TOKEN_COOKIE] ? null : null))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-50-sign-out-others-reads-no-cookie-unit: "sign out other sessions" reads no refresh cookie')
