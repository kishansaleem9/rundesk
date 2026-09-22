# The parser stops requiring the WHOLE box to be a duration and matches parts
# wherever it finds them.
#
# `estimate.ts` says what that costs, and says it twice: the guard "is what
# rejects '12x'", and removing it "would read '12x' as twelve hours and 'due
# soon 3h' as three — recording an estimate nobody made."
#
# THIS PATCH WOULD HAVE RUN GREEN YESTERDAY. The suite's only nonsense input
# was the word "soon", which has no digits in it — so `PART_RE` finds no parts,
# `found` stays false, and the parser refuses it whether or not `WHOLE_RE` is
# there. All three nonsense checks passed under a parser that had stopped
# guarding anything, because the input could not tell the two apart. The unit
# test covers "12x"; nothing drove it through the field, and the field is where
# the suggestion row and the put-back live.
#
# So the suite now types `12x` as well, and this is the patch that earns those
# two checks: the field offers "12 hours" under it and commits twelve hours over
# whatever was stored. One number, one letter, and an estimate nobody typed.
#
# ALSO CAUGHT BY `estimate.test.ts`, 13 pass / 2 fail. The unit test always saw
# this; the browser suite could not until it typed something with a digit in it.
#
# Reddens: time-estimate: "and \"12x\" is not twelve hours — no suggestion under a number with rubbish attached"
import io
p = '/home/user/rundesk/apps/web/src/lib/estimate.ts'
a = "  if (!WHOLE_RE.test(text)) return null\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('estimate.ts: duration parts are now matched anywhere in the box.')
