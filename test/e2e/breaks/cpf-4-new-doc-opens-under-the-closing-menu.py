# NEW DOC OPENS THE CREATOR FROM `onSelect` AGAIN, WHILE THE "+" MENU STILL HOLDS THE CURSOR.
#
# `found-29-sep/comment-plus-menu-keeps-focus-after-create`, for the New Doc
# row alone: the creator opens on the Doc tab, which the two checks above this
# one confirm, and the cursor ends on the "+" behind it, so a doc named by
# typing is named nowhere.
#
# Reddens: comment-plus-menu: "and the cursor is in the doc’s title, not left in the “+” menu or on the “+” behind the creator"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """            data-testid="comment-plus-new-doc"
            onSelect={() => {
              createChosen.current = 'doc'
            }}
"""
b = """            data-testid="comment-plus-new-doc"
            onSelect={() => onQuickCreate('doc')}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: New Doc opens the creator while the "+" menu still holds the cursor.')
