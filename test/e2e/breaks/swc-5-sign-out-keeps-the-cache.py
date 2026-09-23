# SIGNING OUT LEAVES THE API CACHE BEHIND for whoever signs in next.
# Reddens: sw-api-cache: "and the topbar’s Sign out — its menu inside a 1440×900 window — does the same for a member"
import io
p = '/home/user/rundesk/apps/web/src/store/auth.ts'
a = '        void dropApiCache()\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("swc-5-sign-out-keeps-the-cache: applied")
