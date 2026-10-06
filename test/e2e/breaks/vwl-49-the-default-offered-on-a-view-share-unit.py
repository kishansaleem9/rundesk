# MAKE DEFAULT IS OFFERED ON A VIEW SHARED AT FULL EDIT, though the list's own level refuses it.
# Reddens: unit: view-write.test.ts "offers a view shared with them at Full edit to change and delete, but not as the list’s default"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "    mayMakeDefault: mayChange && view.visibility !== 'private' && onList,\n"
b = "    mayMakeDefault: mayChange && view.visibility !== 'private',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-49-the-default-offered-on-a-view-share-unit: make default is offered on a view shared at full edit")
