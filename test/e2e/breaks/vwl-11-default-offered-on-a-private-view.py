# MAKE DEFAULT IS OFFERED ON A PRIVATE VIEW, which the server refuses: the list's default cannot be private.
# Reddens: view-writes-by-level: "their own private view’s ⋯ offers them Update, Rename and Delete, and not Make default, which a private view cannot be"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '              {!view.isDefault && may.makeDefault && (\n'
b = '              {!view.isDefault && (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-11-default-offered-on-a-private-view: make default is offered on a private view, which the server refuses: the list's default cannot be private")
