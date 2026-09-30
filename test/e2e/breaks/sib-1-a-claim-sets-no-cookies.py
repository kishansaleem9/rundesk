# ACCEPTING AN INVITATION SETS NO COOKIES AGAIN, IN A BROWSER (`found-30-sep/an-accepted-invitation-sets-no-cookies`).
#
# `sip-51`'s edit, measured where a person sees it: the newcomer lands in the
# workspace holding no cookie, and a reload sends them to the sign-in page.
#
# Reddens: session-in-the-browser:
#   "a newcomer who accepts an invitation holds the session cookies, and a reload keeps them signed in: /users/me answers 200, a user is held, and /app does not send them to the sign-in page"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
a = "    setAuthCookies(res, bundle, { secure: (this.config.get<string>('NODE_ENV') ?? 'development') === 'production' })\n"
b = "    void res\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-1-a-claim-sets-no-cookies: the claim sets no cookies')
