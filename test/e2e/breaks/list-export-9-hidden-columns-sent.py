# THE VIEW'S HIDDEN COLUMNS ARE SENT AS VISIBLE.
# Reddens: list-export: "in the list, with Priority hidden, the download asks for the list’s columns and not Priority"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '    const builtIn = BUILTIN_COLUMNS.filter((c) => c.views.includes(view) && !hiddenFields.has(c.key)).map((c) => EXPORT_KEY_OF_COLUMN[c.key])\n'
b = '    const builtIn = BUILTIN_COLUMNS.filter((c) => c.views.includes(view)).map((c) => EXPORT_KEY_OF_COLUMN[c.key])\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("list-export-9-hidden-columns-sent: applied")
