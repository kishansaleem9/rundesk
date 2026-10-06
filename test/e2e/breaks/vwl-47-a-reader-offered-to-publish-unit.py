# A READER IS OFFERED TO SHARE THEIR PRIVATE VIEW WITH EVERYBODY, which the server refuses below Edit.
# Reddens: unit: view-write.test.ts "offers a reader their own private view to change, never as the default, and not to share"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "  const mayChangeVisibility = mayChange && ownerOrManager && (view.visibility !== 'private' || onList)\n"
b = '  const mayChangeVisibility = mayChange && ownerOrManager\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-47-a-reader-offered-to-publish-unit: a reader is offered to share their private view with everybody")
