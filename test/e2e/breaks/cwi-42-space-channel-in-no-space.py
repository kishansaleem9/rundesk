# A SPACE’S CHANNEL COMES INTO NO SPACE.
# (`found-14-oct/clickup-import-rest-unimported`)
# Reddens: clickup-workspace-import: "a channel of a ClickUp Space comes into the Space the import brought it to"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('          spaceId: c.place ? (this.places.get(c.place) ?? null) : null,\n',
     '          spaceId: null,\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-42-space-channel-in-no-space: A SPACE’S CHANNEL COMES INTO NO SPACE.')
