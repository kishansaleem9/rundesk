# A DM'S TASKS TAB WITH ONLY THE PRIVATE-ITEM RULE, as it was: a colleague's task in a space the reader is refused.
# Reddens: workspace-read-access: "what a member and a colleague are both on (a DM’s Tasks tab) lists nothing of a space the member is refused, nor a private task — the admin’s lists it"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = '    const visible = and(containerVisibilityFilter(this.db, userId, isManager), taskVisibilityFilter(this.db, userId, isManager))\n'
b = '    const visible = taskVisibilityFilter(this.db, userId, isManager)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-40-shared-skips-containers: applied")
