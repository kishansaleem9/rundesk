# TWO LISTS OF ONE NAME IN ONE PROJECT KEEP THE NAME: the second is the first, and its tasks go in it.
# Reddens: clickup-current-export: "each List is in its Folder’s project, the two Inboxes straight in their Spaces share the Space’s own named for their Space, and a task also in a second List is imported once, in its Home Location"
import io
p = '/home/user/rundesk/apps/api/src/modules/imports/import-plan.ts'
a = 'const name = (sharing.get(key(e)) ?? 0) > 1 && e.where ?'
b = 'const name = false && e.where ?'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cce-5-two-lists-of-one-name-merge: applied")
