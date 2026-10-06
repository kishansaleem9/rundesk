# + VIEW IS OFFERED TO EVERYBODY, whatever the list answers.
# Reddens: view-writes-by-level: "in a view-only list the page offers the member no + View, no ⋯ on the admin’s views — no Update, Rename, Make default or Delete — and no Save view once they change one, on a saved view or a built-in tab"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '              listAccess.views ? (\n'
b = '              true ? (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('vwl-8-add-view-for-all: + view is offered to everybody, whatever the list answers')
