# THE PANEL SENDS NO `fields`, as it never did — the server guesses five columns for every view.
# Reddens: list-export: "in the list, with Priority hidden, the download asks for the list’s columns and not Priority"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "      if (columns === 'visible' && exportFields?.length) query.set('fields', exportFields.join(','))\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("list-export-8-web-sends-no-fields: applied")
