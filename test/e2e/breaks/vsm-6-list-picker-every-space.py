# THE LIST CREATOR NAMES EVERY SPACE AGAIN, a view-only one included.
# Reddens: view-only-space-menus: "the Task, List, Folder and Form creators offer the member the open space and not the view-only one"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  }).data ?? []).filter((s) => CREATE_TYPES.some((ty) => ty.value === 'list' && creatable(ty, s.id)))\n"
b = "  }).data ?? []).filter((s) => s.id !== '')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("vsm-6-list-picker-every-space: the list picker names every space")
