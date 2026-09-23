# THE TABLE'S CUSTOM-FIELD COLUMNS ARE NOT SENT.
# Reddens: list-export: "and in the table it asks for the custom fields the table shows"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "    const custom = view === 'table' ? projectFields.filter((f) => !hiddenFields.has(f.id)).map((f) => `cf:${f.id}`) : []\n"
b = '    const custom: string[] = []\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("list-export-10-table-sends-no-custom-fields: applied")
