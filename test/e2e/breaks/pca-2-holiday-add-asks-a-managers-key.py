# ADDING A HOLIDAY ASKS A MANAGER'S KEY: a manager adds one, and the member granted the calendar's key cannot.
# Reddens: people-calendar-access: "a manager sets no working days, adds no holiday and removes none (403 each, the calendar unchanged) — the admin does all three"
#   or "a member granted workspace.schedule.manage sets a Sunday-to-Thursday week, adds a holiday and removes it"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('workspace.schedule.manage')\n  async addHoliday("
b = "  @RequirePermissions('members.profile.manage')\n  async addHoliday("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pca-2-holiday-add-asks-a-managers-key: POST holidays asks members.profile.manage')
