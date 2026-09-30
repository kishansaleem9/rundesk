# THE LIST PAGE DRAWS EVERY FIELD OF THE PROJECT, as it did (`found-30-sep/field-route-takes-another-projects-field`): a field scoped to another
# list is a column here, whose cells take a value the row never shows (and the route now refuses).
# Reddens: custom-field-types: "the grid draws a column for a field scoped to this list, and none — no cell, no header, nothing in its Fields picker — for one scoped to another list of the project, which this list’s tasks do not have"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "  const projectFields = useMemo(() => fieldsOfList(allProjectFields, listId), [allProjectFields, listId])\n"
b = "  const projectFields = useMemo(() => allProjectFields, [allProjectFields]) // BROKEN: every field of the project\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("frt-4-the-grid-draws-every-field-of-the-project: the list page draws a column for a field scoped to another list")
