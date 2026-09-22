# The background chosen in the pre-join is not carried into the call.
#
# THE FACADE AT ITS MOST CONVINCING, because both halves are real. The picker
# works: five swatches, the preview tints, the choice is held in the pre-join's
# own state and handed to `confirmJoin` as `chosen`. The call works: it takes a
# `background` prop, `BACKGROUND_TINT` maps it to a class, and passing anything
# other than `none` paints the tiles. The two components are joined by ONE line,
# and this deletes it.
#
# What is left is a feature that demos perfectly. You open the pre-join, pick
# Navy, watch the preview turn navy, press Join — and the call is black, with no
# error and nothing to notice unless you were looking for it. `setBackground` is
# still there, still called from the picker inside the call if there is one, so
# the file does not look like it is missing a write.
#
# The plausible route is a linter: `chosen` is one of three parameters
# `confirmJoin` takes, and removing the only use of one makes it an unused
# parameter that somebody then deletes for being unused.
#
# One check, and the suite's own comment says why it is placed where it is:
# "Checked here rather than in the pre-join because this is the half nothing
# else sees." Every pre-join check still passes.
#
# Reddens: syncup-live: "and the background chosen in the pre-join survives into the call"
import io
p = '/home/user/rundesk/apps/web/src/components/call/call-host.tsx'
a = """      setStream(media)
      setBackground(chosen)
      setSpeakerId(speaker)
"""
b = """      setStream(media)
      setSpeakerId(speaker)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('call-host.tsx: the pre-join background never reaches the call.')
