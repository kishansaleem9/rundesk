# THE FOLDER MOVE AS IT WAS: its own manage rule checked, the destination not.
# Reddens: space-default-permission: "nor their own folder into the view-only space"
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.service.ts'
a = "      await assertCanPlaceIn(this.db, { spaceId: targetSpaceId, actorId, kind: 'folder' })\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sdp-30-folder-move-ungated: applied")
