# A MONDAY ITEM SITS IN ITS GROUP’S STATUS WHEN THE STATUS COLUMN IS THE STATUSES.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "with its status column as the statuses, the board’s labels are the List’s, those Monday marks done closed"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/monday.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      const status = byColumn ? (valueOf(item, statusColumn!.id)?.text ?? null) : (item.group?.id ? groupName.get(item.group.id) ?? null : null)\n',
     '      const status = item.group?.id ? groupName.get(item.group.id) ?? null : null\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-25-column-ignored: A MONDAY ITEM SITS IN ITS GROUP’S STATUS WHEN THE STATUS COLUMN IS THE STATUSES.')
