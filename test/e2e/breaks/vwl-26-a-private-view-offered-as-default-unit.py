# A PRIVATE VIEW IS OFFERED AS THE LIST'S DEFAULT, which the server refuses.
# Reddens: unit: view-write.test.ts "offers an editor a shared view to change and default, and who sees it only when it is theirs or they manage"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "    mayMakeDefault: mayChange && view.visibility !== 'private' && onList,\n"
b = '    mayMakeDefault: mayChange && onList,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-26-a-private-view-offered-as-default-unit: a private view is offered as the list's default, which the server refuses")
