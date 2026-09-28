# THE WORKING WEEK ASKS ONLY MEMBERSHIP: any member rewrites the workspace's working days.
# Reddens: people-calendar-access: "a plain member is refused every calendar write (403 each) yet reads the working week and the holidays the planner draws"
#   or "a manager sets no working days, adds no holiday and removes none (403 each, the calendar unchanged) — the admin does all three"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('workspace.schedule.manage')\n  async setWorkDays("
b = '  @UseGuards(WorkspaceMemberGuard)\n  async setWorkDays('
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pca-5-week-asks-no-key: PATCH work-schedule asks no key')
