# The Calendar tab lists every meeting the CALLER attended, not the ones both
# people were at.
#
# `bothIds` stops intersecting with the other person's attendance, so the "both"
# condition disappears — and the method's own comment is about that condition:
# "Meetings both of us attended: two passes over the attendee table rather than
# a self-join, which keeps the 'both' condition obvious."
#
# Obvious and removable. The tab then shows your own calendar under a heading
# reading "Meetings with <them>", which is a specific and confident falsehood:
# every one-to-one you had with somebody else, every solo block, presented as
# time you spent with this person. It is the one screen in the product where
# that claim is made, and there is no second surface to contradict it.
#
# `.filter((id) => theirSet.has(id))` on the end of a `[...new Set(...)]` chain
# reads as a de-duplication step, which is what the line before it is.
#
# ONE CHECK, AND IT IS AN ABSENCE AGAIN: "the meeting only one attended is
# absent". The shared meeting is still listed, so the check above it passes —
# that pair is what makes this catchable, because a tab that shows the right
# meeting AND the wrong ones is indistinguishable from a correct one if you
# only look for the right one.
#
# Reddens: a39-dm-tabs: "the meeting only one attended is absent"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = "    const bothIds = [...new Set(mine.map((r) => r.meetingId))].filter((id) => theirSet.has(id))"
b = "    const bothIds = [...new Set(mine.map((r) => r.meetingId))]"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('meetings.service.ts: the DM Calendar lists meetings only one person attended.')
