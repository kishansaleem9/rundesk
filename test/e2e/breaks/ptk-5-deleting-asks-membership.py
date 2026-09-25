# DELETING A TEMPLATE ASKS ONLY MEMBERSHIP: a plain member deletes one.
# Reddens: project-template-key: "a plain member neither makes nor deletes a template (403 each) — the member granted template.manage makes one and deletes it"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @Delete(':templateId')\n  @UseGuards(PermissionsGuard)\n  @RequirePermissions('template.manage')\n"
b = "  @Delete(':templateId')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ptk-5-deleting-asks-membership: deleting asks no key')
