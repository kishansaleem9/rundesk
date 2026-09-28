# THE WORKING WEEK ASKS workspace.manage, AN ADMIN'S KEY THE CALENDAR'S GRANT DOES NOT CARRY: the member granted workspace.schedule.manage sets no week.
# Reddens: people-calendar-access: "a member granted workspace.schedule.manage sets a Sunday-to-Thursday week, adds a holiday and removes it"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('workspace.schedule.manage')\n  async setWorkDays("
b = "  @RequirePermissions('workspace.manage')\n  async setWorkDays("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pca-4-week-refuses-the-grant: PATCH work-schedule asks workspace.manage')
