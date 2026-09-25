# MAKING A TEMPLATE ASKS ONLY MEMBERSHIP: a plain member makes one.
# Reddens: project-template-key: "a plain member neither makes nor deletes a template (403 each) — the member granted template.manage makes one and deletes it"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @Post()\n  @UseGuards(PermissionsGuard)\n  @RequirePermissions('template.manage')\n"
b = '  @Post()\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ptk-4-making-asks-membership: making asks no key')
