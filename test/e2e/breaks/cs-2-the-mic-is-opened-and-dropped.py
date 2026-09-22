# The chosen microphone is opened and never joined to the recording.
#
# `display.addTrack(track)` goes. `getUserMedia` still runs, the permission
# prompt still appears, the device light still comes on — and the stream handed
# to the recorder has only the display's system audio in it. Every clip is
# recorded without the narration it was recorded for.
#
# The suite's failure message is already the description: "the microphone was
# opened and never added to the stream — a silent clip either way." And it is
# the reason that check exists beside the one above it: opening a microphone and
# using one are two facts, and the `getUserMedia` call is evidence only of the
# first.
#
# The loop is one line inside a `try` whose stated purpose is that a rejected
# mic must not stop the recording — so the block reads as error handling, and
# the line inside it as part of the attempt rather than the point of it.
#
# ONE CHECK. "Opens the chosen microphone as its own capture" passes, because
# it does; the quality and source constraints are untouched; the setup is still
# remembered. Only the track count fails.
#
# NOT CAUGHT BY THE UNIT TEST — 20 pass / 0 fail — and it is the only one of
# the four that is not. `displayConstraints`, `micConstraints` and the store
# are pure functions and all three of the other patches trip them. This patch
# is inside `openClipStream`, which calls the browser: whether `addTrack` was
# reached is a fact about a MediaStream, and only a run that fakes
# `getDisplayMedia` can count the tracks on it.
#
# That is the division of labour in one file — three constraint bugs the module
# test sees, and one wiring bug only the browser does.
#
# Reddens: clip-setup: "and joins that track to the recording"
import io
p = '/home/user/rundesk/apps/web/src/lib/clip-capture.ts'
a = "    for (const track of mic.getAudioTracks()) display.addTrack(track)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clip-capture.ts: the microphone track is opened and never added to the stream.')
