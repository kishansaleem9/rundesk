# PRIVATE IS OFFERED ON THE LIST'S DEFAULT VIEW, which the server refuses.
# Reddens: unit: view-write.test.ts "offers Private on no default view, which the server refuses; Protect stays offered there"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "    mayMakePrivate: mayChangeVisibility && view.visibility !== 'private' && !view.isDefault,\n"
b = "    mayMakePrivate: mayChangeVisibility && view.visibility !== 'private' && true,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-50-private-offered-on-the-default-unit: private is offered on the list's default view")
