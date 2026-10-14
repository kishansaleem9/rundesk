# A PEOPLE FIELD DOES NOT COME IN.
# (`found-14-oct/clickup-docs-time-goals-unimported`)
# Reddens: clickup-workspace-import: "its Custom Fields come in: a currency as a number, a dropdown by its option (ClickUp names it by its place), a link, a checkbox, a date, Labels as their names, a People field as its people’s names; an empty one does not"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    case 'users': {\n",
     "    case 'users-not-read': {\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-26-people-field-left-out: A PEOPLE FIELD DOES NOT COME IN.')
