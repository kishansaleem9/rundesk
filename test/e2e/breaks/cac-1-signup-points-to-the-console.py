# SIGN-UP SENDS THE CHOICE TO "ADMIN → FEATURES" AGAIN, the platform console.
# Reddens: clickapps-copy: "sign-up’s Features step says the choice is changed later in Settings → Features, where a workspace’s switches are, not in the admin console"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
s = io.open(p, encoding='utf-8').read()
a = "You can always change this later in Settings → Features.\","
b = "You can always change this later in Admin → Features.\","
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cac-1-signup-points-to-the-console: done')
