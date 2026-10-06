# SHARED VIEWS ASK COMMENT, so a commenter changes the views everybody shares.
# Reddens: unit: view-write.test.ts "asks Edit of a shared view"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "export const SHARED_VIEW_LEVEL: SpaceDefaultPermission = 'edit'\n"
b = "export const SHARED_VIEW_LEVEL: SpaceDefaultPermission = 'comment'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('vwl-19-shared-views-ask-comment-unit: shared views ask comment, so a commenter changes the views everybody shares')
