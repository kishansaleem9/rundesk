# DELETING A LIST SOMEBODY ELSE MADE ASKS THE ROLE AGAIN, NOT list.delete: an admin, or a manager in their own space.
# Reddens: container-delete-keys: "a member granted list.delete deletes a list another member made where they hold Full edit, and it is in their Trash — a plain member, and one granted only project.delete, are refused it (403) and it stays until then"
#   or "the project page is told what the routes answer: Delete on another member’s list for the member granted list.delete, Archive of the project for the one granted project.delete, and neither for a plain member"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (kind === 'list') return roles.hasPermission(workspaceId, actorId, 'list.delete')\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cdk-1-list-asks-the-role: a list asks the manager role, not list.delete')
