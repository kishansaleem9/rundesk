# ONLY AN ADMIN'S KEY CHANGES A TEMPLATE'S TAGS (`ledger-rows/row-1874`).
#
# The route asks `members.remove`, which the catalog gives admins and not
# managers: a manager may save, make and delete a template and is refused its
# tags — the split `found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`
# closed for the other template routes.
#
# Reddens: template-center: "a manager, who holds template.manage by default, may tag a template somebody else made"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.controller.ts'
a = ("  @Patch(':templateId/tags')\n"
     "  @UseGuards(PermissionsGuard)\n"
     "  @RequirePermissions('template.manage')\n")
b = ("  @Patch(':templateId/tags')\n"
     "  @UseGuards(PermissionsGuard)\n"
     "  @RequirePermissions('members.remove') // BROKEN: an admin's key\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-30-only-admins-retag: the tags route asks an admin\'s key')
