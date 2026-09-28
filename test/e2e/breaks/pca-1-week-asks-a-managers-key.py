# THE WORKING WEEK ASKS A MANAGER'S KEY: a manager sets the workspace's working days, and the member granted the calendar's key cannot.
# Reddens: people-calendar-access: "a manager sets no working days, adds no holiday and removes none (403 each, the calendar unchanged) — the admin does all three"
#   or "a member granted workspace.schedule.manage sets a Sunday-to-Thursday week, adds a holiday and removes it"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('workspace.schedule.manage')\n  async setWorkDays("
b = "  @RequirePermissions('members.profile.manage')\n  async setWorkDays("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pca-1-week-asks-a-managers-key: PATCH work-schedule asks members.profile.manage')
