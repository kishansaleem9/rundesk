# DELETING A SHARED VIEW ASKS COMMENT, so a commenter deletes the views everybody shares.
# Reddens: unit: view-write.test.ts "asks Full edit to delete a shared view"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "export const SHARED_VIEW_DELETE_LEVEL: SpaceDefaultPermission = 'admin'\n"
b = "export const SHARED_VIEW_DELETE_LEVEL: SpaceDefaultPermission = 'comment'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-43-deleting-asks-comment-unit: deleting a shared view asks comment")
