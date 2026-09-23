# A DROPDOWN EXPORTED AS ITS STORED VALUE — `ready`, not "Ready to ship".
# Reddens: list-export: "a custom field the view shows is a column of its own, a dropdown written as its label"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "        case 'dropdown':\n          return label(String(value))\n"
b = "        case 'dropdown':\n          return String(value)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("list-export-6-dropdown-by-value: applied")
