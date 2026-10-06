# THE FIRST VIEW ON A LIST IS ITS DEFAULT WHATEVER IT IS: a reader's private view takes the list's default.
# Reddens: view-writes-by-level: "on an empty list a reader’s private view does not take the list’s default, and the admin’s first view, shared, does"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = "      const isDefault = visibility !== 'private' && shared.length === 0\n"
b = '      const isDefault = shared.length === 0\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-4-a-private-first-view-is-the-default: a private first view takes the list's default")
