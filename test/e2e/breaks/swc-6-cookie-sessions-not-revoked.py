# THE ENDPOINT ONLY WHEN A REFRESH TOKEN IS STORED — which a cookie session never has.
# Reddens: sw-api-cache: "and the topbar’s Sign out — its menu inside a 1440×900 window — does the same for a member"
import io
p = '/home/user/rundesk/apps/web/src/lib/sign-out.ts'
a = "    await api('/auth/logout', {\n"
b = "    if (refreshToken) await api('/auth/logout', {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("swc-6-cookie-sessions-not-revoked: applied")
