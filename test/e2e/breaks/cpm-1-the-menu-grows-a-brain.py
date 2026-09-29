# "Brain" is in the "+" menu as a row that does nothing.
#
# RE-AIMED 29 September, when Brain joined the menu for real
# (`ledger-rows/row-751`). This patch used to ADD a Brain row with
# `onSelect={() => {}}` and redden the check
# that kept Brain out — "and Brain, which has nothing behind it, is still
# absent" — because the menu then had no engine behind the word. The comment
# AI panel the space bar opens is that engine, so the row is there now, wired
# to the same opener the space bar calls.
#
# The facade this file was written against is unchanged, and so is its name:
# the menu grows a Brain with nothing behind it. A `DropdownMenuItem` with an
# icon and a label whose handler opens nothing. Ten of ten items, exactly as
# the frame lists them, and one of them goes nowhere. A screenshot review
# passes it; the person who presses it learns the menu is unreliable and stops
# trusting the other nine.
#
# ONE CHECK. Every item is still in the menu, so the count check passes; only
# the check that follows Brain to the panel fails — which is why that check
# presses the row instead of reading its label.
#
# Reddens: comment-plus-menu: "and Brain, which now has the comment AI panel behind it, opens that panel"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """            data-testid="comment-plus-brain"
            onSelect={() => {
              brainChosen.current = true
              onBrain()
            }}
"""
b = """            data-testid="comment-plus-brain"
            onSelect={() => {
              brainChosen.current = true
            }}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the "+" menu offers Brain, which does nothing.')
