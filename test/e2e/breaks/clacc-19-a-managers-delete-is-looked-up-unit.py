# A MANAGER'S DELETE LOOKS THE CLIP UP FIRST (`found-5-oct/guests-read-and-delete-every-clip`).
#
# A delete that needs nobody's recorder costs a look at the store, and one
# of a clip already gone answers 404 where it answered 200.
#
# Reddens: unit: clips.service.test.ts "its recorder deletes it; somebody who manages the workspace deletes anybody’s, without looking it up"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '    const head = isManagerRole(reader.role) ? undefined : await this.headOrMissing(storageKey)\n'
b = '    const head = await this.headOrMissing(storageKey)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-19-a-managers-delete-is-looked-up-unit: applied')
