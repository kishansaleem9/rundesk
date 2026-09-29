# NEW WHITEBOARD OPENS THE CREATOR FROM `onSelect` AGAIN, WHILE THE "+" MENU STILL HOLDS THE CURSOR.
#
# `found-29-sep/comment-plus-menu-keeps-focus-after-create`, for the New
# Whiteboard row alone: the creator opens on the Whiteboard form and the cursor
# ends on the "+" behind it.
#
# Reddens: comment-plus-menu: "New Whiteboard opens the creator on the Whiteboard form, with the cursor in the whiteboard’s title"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """            data-testid="comment-plus-new-whiteboard"
            onSelect={() => {
              createChosen.current = 'whiteboard'
            }}
"""
b = """            data-testid="comment-plus-new-whiteboard"
            onSelect={() => onQuickCreate('whiteboard')}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: New Whiteboard opens the creator while the "+" menu still holds the cursor.')
