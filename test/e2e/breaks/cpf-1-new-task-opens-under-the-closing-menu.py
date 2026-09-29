# NEW TASK OPENS THE CREATOR FROM `onSelect` AGAIN, WHILE THE "+" MENU STILL HOLDS THE CURSOR.
#
# The state `found-29-sep/comment-plus-menu-keeps-focus-after-create` was found
# in, for the New Task row: the modal mounts while the menu is open, its title
# takes the cursor and the menu's focus trap takes it straight back, the menu
# animates out holding it and then gives it to the "+" behind the modal. The
# creator is on screen, on the right tab, and the cursor is on a button nobody
# can see.
#
# Reddens: comment-plus-menu: "New Task opens the creator with the cursor in its title — not in the closing “+” menu, nor on the “+” behind it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """            data-testid="comment-plus-new-task"
            onSelect={() => {
              createChosen.current = 'task'
            }}
"""
b = """            data-testid="comment-plus-new-task"
            onSelect={() => onQuickCreate('task')}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: New Task opens the creator while the "+" menu still holds the cursor.')
