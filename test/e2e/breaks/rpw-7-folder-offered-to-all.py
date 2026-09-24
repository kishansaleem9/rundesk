# FOLDER IS OFFERED TO A GUEST AGAIN, in the Create menu and on a space's own
# menu, though the API files a folder under `space.create` and refuses them.
# Reddens: role-permissions-web: "a guest who can see the space is offered no Folder — not in the Create menu, the space’s menu, or its New folder row — which the API refuses them, and a member is offered all three"
import io
p = '/home/user/rundesk/apps/web/src/lib/create-types.ts'
a = "scopedToSpace: true, isContainer: true, requires: 'space.create' },\n"
b = 'scopedToSpace: true, isContainer: true },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rpw-7-folder-offered-to-all: Folder is offered to everybody')
