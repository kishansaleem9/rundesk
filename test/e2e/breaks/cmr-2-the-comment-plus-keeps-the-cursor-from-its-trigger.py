# THE COMMENT "+" MENU OPENS THE CREATOR WITHOUT LETTING THE CURSOR SETTLE ON THE "+".
#
# `preventDefault` back in the creator branch of `onCloseAutoFocus` (as it was
# when `found-29-sep/comment-plus-menu-keeps-focus-after-create` closed): Radix
# no longer puts the cursor on its trigger, so when the creator opens nothing
# has it but `<body>`, and that is what the creator gives it back to. The title
# still takes the cursor on the way in; the way back is lost.
#
# Reddens: comment-plus-menu: "and the cursor goes back to the “+” the creator was opened from, not to the page"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """              // The "+" has the cursor when the creator opens, and gets it back
              // when it closes; the title takes it as it opens.
              onQuickCreate(chosen)
"""
b = """              e.preventDefault()
              onQuickCreate(chosen)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the comment "+" keeps the cursor from its trigger, so the creator has nothing to give it back to.')
