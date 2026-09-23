# THE CONTROL THAT WORKS IN ONE DIRECTION ONLY. `!== undefined` becomes a
# truthiness test, so every edit is accepted except the one that erases: empty
# the box, press Save, get a 200, reopen it and the old words are back. No
# error, no failing check, nothing on screen to say the edit was refused.
# Reddens: folder-dialog: "emptying the box really deletes it"
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.service.ts'
a = "    if (patch.description !== undefined) set.description = patch.description?.trim() || null"
b = "    if (patch.description) set.description = patch.description.trim()"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('folders.service.ts: a description can be written and never emptied.')
