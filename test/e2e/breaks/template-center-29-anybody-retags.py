# ANY MEMBER CHANGES A TEMPLATE'S TAGS (`ledger-rows/row-1874`).
#
# The route asks no key, so a member who may not save, make or delete a
# template may still retag one — and its tags are what the whole workspace
# filters it by.
#
# Reddens: template-center: "a member without template.manage is refused a template's tags — 403, \"Missing required permission: template.manage\" — and they stay as they were"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.controller.ts'
a = ("  @Patch(':templateId/tags')\n"
     "  @UseGuards(PermissionsGuard)\n"
     "  @RequirePermissions('template.manage')\n")
b = ("  @Patch(':templateId/tags')\n"
     "  // BROKEN: no key asked\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-29-anybody-retags: the tags route asks no key')
