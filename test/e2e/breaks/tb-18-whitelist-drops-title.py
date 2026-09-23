# THE COMMONEST EDIT REFUSED. `title` falls off the list and renaming a task —
# the thing the route is mostly for — answers 400.
# Reddens: task-boundaries: "and an ordinary edit still goes through — the whitelist is a list, not a wall"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/task-update-fields.ts"
a = "  'title',\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-18-whitelist-drops-title: applied")
