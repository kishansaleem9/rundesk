# ACCEPTING AN INVITATION SETS NO COOKIES AGAIN, READ FROM THE CONTROLLER (`found-30-sep/an-accepted-invitation-sets-no-cookies`).
#
# `sip-51`'s edit, claimed by the unit test: the claim's answer sets no cookie.
#
# Reddens: unit: invitations.controller.test.ts "the claim sets the session cookies sign-up sets on its answer (access_token, refresh_token, csrf_token), and answers the session too"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
a = "    setAuthCookies(res, bundle, { secure: (this.config.get<string>('NODE_ENV') ?? 'development') === 'production' })\n"
b = "    void res\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-52-a-claim-sets-no-cookies-unit: the claim sets no cookies')
