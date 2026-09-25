# A PROJECT'S PAGE OFFERS A GUEST "ADD LIST" IN ANY PROJECT THEY CAN OPEN
# AGAIN — a 403 where they only pass through.
# Reddens: guest-create-menu: "a project’s page offers the guest "Add list" in the space with Full edit, and not in the one they pass through, nor from an empty project’s own empty state there — a member is offered both"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
a = "  const mayAddList = CREATE_TYPES.some((ty) => ty.value === 'list' && creatable(ty, spaceId))\n"
b = "  const mayAddList = CREATE_TYPES.some((ty) => ty.value === 'list' && (creatable(ty, spaceId) || spaceId !== ''))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcm-8-add-list-in-any-project: Add list in every project')
