# IMPORTS AND TEMPLATES ARE OFFERED TO A GUEST AGAIN on a space's "+";
# both make tasks, which a guest may not.
# Reddens: guest-create-menu: "on a space a guest only passes through, its own menu offers them no list, task, Imports or Templates — a member’s offers all four"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "                      {workspaceRole !== 'guest' && (\n"
b = '                      {workspaceRole !== undefined && (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcm-6-imports-templates-for-guests: Imports and Templates for everyone')
