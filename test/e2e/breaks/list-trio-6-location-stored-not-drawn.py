# The mirror defect for "Show task locations": the switch flips, the value is
# held, the name is resolved — and never put in the map, so no row draws it.
# Reddens: list-customize: "a row gains the name of the list it is in, read off the row rather than off the URL"
import io
p = "/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx"
a = "        if (name) location.set(task.id, name)"
b = "        if (name) void name"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('the location is looked up and thrown away.')
