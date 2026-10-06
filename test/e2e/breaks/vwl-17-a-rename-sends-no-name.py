# RENAME FROM THE ⋯ SENDS NO NAME, so the view keeps the one it had.
# Reddens: view-writes-by-level: "where the default is Edit the member is offered + View and each view’s ⋯ — Update, Rename, Make default, and not Delete, which takes Full edit — and a rename made from it is saved"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "      await api(`/views/${viewId}`, { method: 'PATCH', body: { name } })\n"
b = "      await api(`/views/${viewId}`, { method: 'PATCH', body: {} })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-17-a-rename-sends-no-name: rename from the ⋯ sends no name, so the view keeps the one it had")
