# A LIST’S VIEWS ARE LEFT OUT.
# (`found-14-oct/clickup-import-rest-unimported`)
# Reddens: clickup-workspace-import: "a List’s views come in as its views here: the pinned board grouped by priority, newest due first, its default; Ana’s private list hers alone; a Form view, which no List here has, not made"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (l.views?.length) await this.views(row.id, l.views)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-46-views-left-out: A LIST’S VIEWS ARE LEFT OUT.')
