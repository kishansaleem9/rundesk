# AN EMPTY PROJECT'S OWN EMPTY STATE OFFERS "ADD LIST" TO ANYONE AGAIN,
# whether or not the header's button is offered.
# Reddens: guest-create-menu: "a project’s page offers the guest "Add list" in the space with Full edit, and not in the one they pass through, nor from an empty project’s own empty state there — a member is offered both"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
a = '              mayAddList ? (\n'
b = "              mayAddList || projectId !== '' ? (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcm-9-empty-state-add-list: the empty state offers Add list to anyone')
