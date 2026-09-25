# SAVING A PROJECT AS A TEMPLATE ASKS ONLY MEMBERSHIP: a plain member saves one.
# Reddens: project-template-key: "a member granted template.manage saves a project as a template, and so does a manager — a plain member saves none (403)"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @Post('save-from-project')\n  // Making, saving and deleting a template ask `template.manage`, as task\n  // templates do: `WorkspaceAdminGuard` admitted managers and refused the grant\n  // (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`).\n  @UseGuards(PermissionsGuard)\n  @RequirePermissions('template.manage')\n"
b = "  @Post('save-from-project')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ptk-1-saving-asks-membership: saving asks no key')
