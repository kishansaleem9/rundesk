# The same for "Show subtask parent names". The title is found and dropped.
# Reddens: list-customize: "a subtask row says which task it belongs to"
import io
p = "/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx"
a = "        if (title) parent.set(task.id, title)"
b = "        if (title) void title"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('the parent title is looked up and thrown away.')
