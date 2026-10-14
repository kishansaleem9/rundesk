# A DROPDOWN'S VALUE IS LOOKED UP BY ITS OPTION'S ID ONLY, NOT ITS PLACE.
# (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
# Reddens: clickup-workspace-import: "its Custom Fields come in: a currency as a number, a dropdown by its option (ClickUp names it by its place), a link, a checkbox, a date, Labels as their names, a People field as its people’s names; an empty one does not"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        options.find((o) => o.orderindex !== undefined && String(o.orderindex) === String(v)) ??\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cwi-5-dropdown-by-id-only: A DROPDOWN'S VALUE IS LOOKED UP BY ITS OPTION'S ID ONLY, NOT ITS PLACE.")
