# A SPACE IMPORTED AGAIN INTO THE SAME PLACE FAILS ON ITS FIRST LIST'S NAME.
# (`found-14-oct/clickup-docs-time-goals-unimported`)
# Reddens: clickup-workspace-import: "asked for them, the Workspace’s own Docs come in beside the workspace’s other Docs; time and Goals turned off are neither read nor made"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (!taken.has(name.toLowerCase())) return name\n',
     '    if (taken.size >= 0) return name\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cwi-30-reimport-fails-on-a-list-name: A SPACE IMPORTED AGAIN INTO THE SAME PLACE FAILS ON ITS FIRST LIST'S NAME.")
