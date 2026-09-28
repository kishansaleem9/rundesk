# READING THE GROUPS ASKS GROUPS.MANAGE: a plain member and the manager read no group, so mentions and the Teams page go empty.
# Reddens: user-group-access: "a plain member and the manager still read the workspace’s user groups — the list with each group’s members, and one group by id (200 each) — as mentions and the Teams page need"
#   or "the Teams page lists the teams to the manager and to a plain member, but offers neither of them Create Team — it is disabled and says why"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = '  @Get()\n  list('
b = "  @Get()\n  @UseGuards(PermissionsGuard)\n  @RequirePermissions('groups.manage')\n  list("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = "  @Get(':groupId')\n  get("
b = "  @Get(':groupId')\n  @UseGuards(PermissionsGuard)\n  @RequirePermissions('groups.manage')\n  get("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uga-1-reads-ask-the-key: the list and one group ask groups.manage')
