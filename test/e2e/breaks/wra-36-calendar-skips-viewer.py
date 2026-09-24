# A PERSON'S CALENDAR WITH NO VIEWER RULE, as it was: every dated task of theirs.
# Reddens: workspace-read-access: "a colleague’s profile (every bucket), activity, calendar and team-schedule column show a member nothing from a space they are refused — the admin’s own show it"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = '          (await this.viewerFilter(workspaceId, requesterId)).where,\n          // A task counts as inside the window if either end of it is.\n'
b = '          // A task counts as inside the window if either end of it is.\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-36-calendar-skips-viewer: applied")
