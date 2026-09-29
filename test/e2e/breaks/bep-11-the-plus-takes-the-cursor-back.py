# BRAIN OPENS THE PANEL AND THE CLOSING MENU TAKES THE CURSOR BACK TO THE "+".
#
# The state this row's first build was in, found by this check: the opener
# puts the cursor in the panel's prompt, the menu takes it back while it
# animates out, and once the menu has closed Radix returns focus to its
# trigger. The panel is open and the first thing typed goes to a button. It
# passes any check that looks for the panel, and fails the one that asks where
# the cursor is once the menu is gone.
#
# Reddens: brain-entry-points: "choosing Brain opens the comment AI panel — the one the space bar opens, exactly one — with the cursor in its prompt"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """            brainChosen.current = false
            e.preventDefault()
            brainFocus.current?.focus()
"""
b = """            brainChosen.current = false
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: after Brain, the closing "+" menu hands the cursor back to itself.')
