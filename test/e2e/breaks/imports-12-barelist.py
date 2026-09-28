# Check 12 — seed half the status pipeline. A list with three of six statuses is
# the shape `db.insert(lists)` leaves behind when nobody seeds list_statuses.
#
# Reddens: imports: "\\n▶ the list it created is a usable list, not a bare row"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      .values(DEFAULT_STATUSES.map((s) => ({ listId: list.id, ...s })))'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '      .values(DEFAULT_STATUSES.slice(0, 3).map((s) => ({ listId: list.id, ...s })))'))
print('BROKE check 12: the imported list gets 3 of its 6 statuses')
