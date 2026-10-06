# PRIVATE IS OFFERED ON THE LIST'S DEFAULT VIEW, which the server refuses (400).
# Reddens: view-writes-by-level: "once it is the list’s default the panel no longer offers to make it private, which the server refuses for the default, and still offers to protect it"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "    mayMakePrivate: mayChangeVisibility && view.visibility !== 'private' && !view.isDefault,\n"
b = "    mayMakePrivate: mayChangeVisibility && view.visibility !== 'private',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-36-private-offered-on-the-default: private is offered on the list's default view")
