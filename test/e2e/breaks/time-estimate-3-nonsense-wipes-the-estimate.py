# Committing text the field cannot parse wipes the estimate.
#
# The guard that goes is three lines with its reason written above it:
# "Unparseable text is not a reason to wipe an estimate that exists: put back
# what is actually stored and leave it alone." Without it, `commit()` falls
# through to `onCommit(parsed?.seconds ?? null)` and sends null — so typing a
# word over a real estimate and tabbing away destroys it.
#
# It is the destructive one. Every other patch in this set gives a wrong answer;
# this one deletes a right one, and it deletes it in response to a keystroke
# nobody thought of as an edit. The box is also left showing what was typed, so
# the screen agrees with the loss and nothing looks wrong until the number is
# needed.
#
# `next` is already computed on the line above, which is what makes the guard
# look redundant: it reads as a second way of saying the same thing, and the
# early `return` is the only part that matters.
#
# REDDENS TWO, NOT THE THREE PREDICTED, and the third is worth understanding.
# The estimate is gone after a word and the box does not put back what is
# stored — both fail. "Committing 12x changes nothing" PASSES, because by then
# the estimate is already null: the word wiped it, `12x` wipes it again, and
# null equals null. A patch that destroys a value cannot be caught a second
# time by a check comparing before and after, once there is nothing left to
# destroy.
#
# That is an ordering property of the suite rather than a weakness in either
# check: the word comes first because a word is the ordinary case. Worth the
# paragraph because "reddened fewer than predicted" is the signal that found a
# vacuous check twice in this session, and this time it is not one.
#
# Reddens: time-estimate: "typing a word leaves the estimate alone"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """    if (text.trim() !== '' && !parsed) {
      setText(formatEstimate(seconds))
      return
    }
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: unparseable text now clears the estimate.')
