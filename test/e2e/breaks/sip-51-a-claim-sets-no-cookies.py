# ACCEPTING AN INVITATION SETS NO COOKIES AGAIN (`found-30-sep/an-accepted-invitation-sets-no-cookies`).
#
# The claim answers its session in the body alone, as it did: the web keeps no
# token across a reload, so a page reloaded after accepting an invitation is
# signed out.
#
# Reddens: sign-in-and-password:
#   "accepting an invitation sets the cookies sign-up sets (access_token, refresh_token, csrf_token), and they alone read /users/me as the newcomer and refresh"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
a = "    setAuthCookies(res, bundle, { secure: (this.config.get<string>('NODE_ENV') ?? 'development') === 'production' })\n"
b = "    void res\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-51-a-claim-sets-no-cookies: the claim sets no cookies')
