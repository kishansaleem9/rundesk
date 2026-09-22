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
# REDDENS THREE, AND THEY ARE THE THREE THAT ASK ABOUT NONSENSE: the estimate
# is gone after a word, the box does not put back what is stored, and
# committing "12x" changes something. The suggestion check between them stays
# green, because nothing here touches whether a row is offered — only what
# happens when the box loses focus.
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
