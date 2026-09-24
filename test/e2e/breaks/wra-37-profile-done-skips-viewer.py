# THE PROFILE'S FINISHED BUCKET WITH NO VIEWER RULE: its own query.
# Reddens: workspace-read-access: "a colleague’s profile (every bucket), activity, calendar and team-schedule column show a member nothing from a space they are refused — the admin’s own show it"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = '            eq(tasks.isArchived, false),\n            viewer,\n          ),\n        )\n        // Nulls last: a closed task'
b = '            eq(tasks.isArchived, false),\n          ),\n        )\n        // Nulls last: a closed task'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-37-profile-done-skips-viewer: applied")
