# THE PROFILE'S HANDED-OVER BUCKET WITH NO VIEWER RULE: its own query.
# Reddens: workspace-read-access: "a colleague’s profile (every bucket), activity, calendar and team-schedule column show a member nothing from a space they are refused — the admin’s own show it"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = '            viewer,\n            // Somebody is on it, and it is not you'
b = '            // Somebody is on it, and it is not you'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-38-profile-delegated-skips-viewer: applied")
