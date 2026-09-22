# The remembered clip key is not cleared when a new recording starts.
#
# This was a real bug, and the comment on the line that goes says so along with
# exactly what it does: "record clip A, copy its link, discard, record clip B,
# copy — and the clipboard gets a link to clip A. The right clip, silently, for
# the wrong recording. Found by writing the check for it, not by using it."
#
# It is the worst shape a caching bug can take. The link works. It plays. It is
# a real clip of a real screen, sent to a colleague as the thing that was just
# recorded, and it is the previous recording — so the person who sent it has no
# reason to look and the person who receives it has no way to know.
#
# `setClipKey(null)` sits in a block of resets — the object URL, the chunks, the
# transcript, the timer — every one of which is obviously about the previous
# recording. Losing one line from a list like that costs nothing at compile
# time and nothing at run time until the second recording.
#
# ONE CHECK, THE LAST, and the suite reads it as a COUNT: presign went from N
# to N after a second clip was recorded and copied. A check on whether the
# clipboard held a working link would pass — both links work, which is the
# whole problem.
#
# Reddens: clip-created-card: "a newly recorded clip is uploaded on its own, not passed off as the last one"
import io
p = '/home/user/rundesk/apps/web/src/components/comment-recorder.tsx'
a = "    setClipKey(null)\n    chunksRef.current = []\n"
b = "    chunksRef.current = []\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('comment-recorder.tsx: a new recording keeps the previous clip\'s key.')
