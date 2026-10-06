# WHO SEES A VIEW IS OFFERED TO ANYBODY WHO MAY CHANGE IT, not only its maker and the managers.
# Reddens: unit: view-write.test.ts "offers an editor a shared view to change and default, and who sees it only when it is theirs or they manage"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "  const mayChangeVisibility = mayChange && ownerOrManager && (view.visibility !== 'private' || onList)\n"
b = "  const mayChangeVisibility = mayChange && (view.visibility !== 'private' || onList)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-27-who-sees-it-offered-to-all-unit: who sees a view is offered to anybody who may change it, not only its maker and the managers")
