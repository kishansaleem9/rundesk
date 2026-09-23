# A WHITELIST TOO TIGHT. The cover field falls off the list, so the Upload tab's
# own, legitimate key is refused by name — the positive twin has to catch this.
# Reddens: task-boundaries: "while this task’s own upload is accepted and stored — the Upload tab still works"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/task-update-fields.ts"
a = "  'coverStorageKey',\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-13-whitelist-drops-cover: applied")
