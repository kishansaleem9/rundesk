# A LINK IS MADE FOR A KEY WITH NO CLIP BEHIND IT (`resume-defects/resume-7`).
#
# The look at the store goes, so Copy link on a clip whose upload never landed
# reports success and puts a link on the clipboard that opens to "not
# available" — the success-over-nothing the card's failed-upload check exists
# to refuse.
#
# Reddens: unit: clips.service.test.ts "is refused for a key that is not one of this workspace’s clips, and for a clip that is not stored"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = "    await this.headOrMissing(key)\n"
b = "    void this.headOrMissing\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-17-a-link-for-nothing-unit: a link is made for a clip that is not stored')
