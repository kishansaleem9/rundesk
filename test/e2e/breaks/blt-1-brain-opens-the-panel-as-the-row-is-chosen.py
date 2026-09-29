# BRAIN OPENS THE PANEL AS THE ROW IS CHOSEN AGAIN, WHILE THE "+" MENU STILL HOLDS THE CURSOR.
#
# The state `found-29-sep/brain-loses-early-typing` was found in: the panel is
# drawn at the choice, its prompt is given the cursor and the open menu's focus
# trap takes it straight back, and the prompt only gets it for good when the
# menu has gone. The cursor does arrive, so the check that waits for it passes;
# what was typed as the panel appeared went into the closing menu.
#
# Reddens: brain-entry-points: "and what is typed as Brain’s panel appears lands in its prompt, every character of it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """            data-testid="comment-plus-brain"
            onSelect={() => {
              brainChosen.current = true
            }}
"""
b = """            data-testid="comment-plus-brain"
            onSelect={() => {
              brainChosen.current = true
              onBrain()
            }}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: Brain opens its panel as the row is chosen, under the closing menu.')
