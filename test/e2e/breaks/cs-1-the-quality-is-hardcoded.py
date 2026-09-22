# `displayConstraints` ignores the chosen quality and always asks for 1080p.
#
# The three dropdowns are the easiest facade in this audit to build, and the
# suite says so in its header: "three selects that remember their values and
# change nothing about the recording. So every check here is about the
# CONSTRAINTS that reach the browser."
#
# This is that facade for one of the three. The panel opens, 720p is selected,
# the value is stored, the next recording opens on 720p — and every clip is
# captured at 1080p. Nothing errors, nothing looks wrong, and the only evidence
# is the argument `getDisplayMedia` was handed, which is why the suite fakes
# that call and asserts against what it recorded rather than against the
# select.
#
# The `?? 1080` fallback is what makes the edit look safe: the line already
# names 1080 as the answer when the lookup misses, so short-circuiting to it
# reads as removing a lookup that mostly returns 1080 anyway.
#
# REDDENS ONE. The width is derived from the same `height` variable, so it goes
# wrong with it and no separate check notices; the source hint, the microphone,
# the joined track and the remembered setup are all untouched. Only the check
# that reads `video.height.ideal` fails — which is the check written for
# exactly this.
#
# ALSO CAUGHT BY `clip-capture.test.ts`, 19 pass / 1 fail — `displayConstraints`
# is a pure function and is unit-tested directly.
#
# Reddens: clip-setup: "at the height that was chosen, not a hardcoded one"
import io
p = '/home/user/rundesk/apps/web/src/lib/clip-capture.ts'
a = "  const height = CLIP_QUALITIES.find((q) => q.id === setup.quality)?.height ?? 1080"
b = "  const height = 1080"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clip-capture.ts: every clip is captured at 1080p whatever was chosen.')
