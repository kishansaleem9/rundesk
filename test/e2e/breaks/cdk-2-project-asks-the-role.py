# DELETING A PROJECT SOMEBODY ELSE MADE ASKS THE ROLE AGAIN, NOT project.delete: an admin, or a manager in their own space.
# Reddens: container-delete-keys: "a member granted project.delete deletes a project somebody else made where they hold Full edit, and it is in their Trash — a plain member, and one granted only list.delete, are refused it (403) and it stays until then"
#   or "the project page is told what the routes answer: Delete on another member’s list for the member granted list.delete, Archive of the project for the one granted project.delete, and neither for a plain member"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (kind === 'project') return roles.hasPermission(workspaceId, actorId, 'project.delete')\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cdk-2-project-asks-the-role: a project asks the manager role, not project.delete')
