# AN EMPTY LIST INVITES EVERYBODY TO ADD.
# Reddens: list-page-levels: "an empty list asks a view-only reader to add nothing — no Create task, no “press C” — and asks where the default is Full edit"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '            {listAccess.add && (\n              <>\n                <p className="text-[13px] text-muted-foreground mb-4">\n'
b = '            {true && (\n              <>\n                <p className="text-[13px] text-muted-foreground mb-4">\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('lpl-32-empty-invites-all: an empty list invites everybody to add')
