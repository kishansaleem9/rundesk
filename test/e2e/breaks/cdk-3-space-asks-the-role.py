# DELETING A SPACE SOMEBODY ELSE MADE ASKS THE ROLE, NOT space.delete: a manager who belongs to it deletes it, and the member granted the key does not.
# Reddens: container-delete-keys: "a member granted space.delete deletes a space somebody else made where they hold Full edit, and it is in their Trash — a plain member, and a manager who belongs to it but holds no space.delete, are refused it (403) and it stays until then"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (kind === 'space') return roles.hasPermission(workspaceId, actorId, 'space.delete')\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cdk-3-space-asks-the-role: a space asks the manager role, not space.delete')
