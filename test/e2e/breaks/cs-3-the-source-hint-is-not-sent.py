# The chosen source stops being passed as `displaySurface`.
#
# It is the one row on this panel that is honestly a HINT, and the suite is
# careful about the difference: "the browser's own screen picker is not
# automatable and is not ours. `displaySurface` is a hint that Chrome uses to
# pre-select a tab in that dialog, so the check is that the hint is SENT."
#
# Which makes this the cheapest possible facade: a select whose only job is to
# be forwarded, not forwarded. Choosing "A window" then lands you on the
# browser's Entire-screen tab every time, and because the picker really does
# ask, the person blames the picker rather than the row above it.
#
# The line carries a comment about `@ts-expect-error` having failed the build as
# an unused directive — so it looks like a property somebody has already had
# trouble with, which is exactly the line a reader deletes when something
# nearby breaks.
#
# ONE CHECK. The height and width still follow the quality, the microphone is
# still opened and joined, the setup is still remembered, and the panel still
# says the browser will ask — which is the honesty check beside this one, and
# it stays green, because the sentence is true either way. That is the pair:
# the panel telling the truth about what it can do, and the hint actually going.
#
# ALSO CAUGHT BY `clip-capture.test.ts`, 19 pass / 1 fail, for the same reason.
#
# Reddens: clip-setup: "and passes the source as the hint the browser understands"
import io
p = '/home/user/rundesk/apps/web/src/lib/clip-capture.ts'
a = """      // `displaySurface` IS in this TypeScript's lib.dom, so no suppression is
      // needed — an `@ts-expect-error` here failed the build as an unused
      // directive, which is the compiler correctly refusing a lie about itself.
      displaySurface: setup.surface,
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clip-capture.ts: the chosen source is no longer sent to the browser.')
