# A VIEW COMES IN UNGROUPED.
# (`found-14-oct/clickup-import-rest-unimported`)
# Reddens: clickup-workspace-import: "a List’s views come in as its views here: the pinned board grouped by priority, newest due first, its default; Ana’s private list hers alone; a Form view, which no List here has, not made"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    groupBy: VIEW_GROUPS[String(v.grouping?.field ?? \'\')] ?? null,\n',
     '    groupBy: null,\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-47-views-ungrouped: A VIEW COMES IN UNGROUPED.')
