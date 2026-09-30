# THE WEB READS A FIELD WITH NO LIST AS NO LIST'S (`found-30-sep/field-route-takes-another-projects-field`): the list page and the AI page would
# offer only fields scoped to the list, and none of the whole project's.
# Reddens: unit: field-scope.test.ts "keeps the project’s fields and this list’s own, and leaves out one scoped to another list"
#   "reads a field with no list as the whole project’s, and one with a list as that list’s alone"
import io
p = '/home/user/rundesk/apps/web/src/lib/field-scope.ts'
a = "  return field.listId == null || field.listId === listId\n"
b = "  return field.listId === listId // BROKEN: a field with no list is no list's\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("frt-10-a-field-with-no-list-is-no-lists-unit: the web reads a field with no list as no list’s")
