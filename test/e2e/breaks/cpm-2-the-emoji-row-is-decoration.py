# The emoji buttons close the row and insert nothing.
#
# `setText((prev) => prev + e)` goes; `setEmojiOpen(false)` and the refocus
# stay. So the row opens, the emoji is pressed, the row closes and the caret
# returns to the composer — every visible consequence of a successful insert —
# and the comment is unchanged.
#
# The suite's failure message is already the description: "the row is
# decoration." And an emoji inserter is the one item on this menu with no
# second surface to check against: reactions on posted comments are a different
# feature, so if the row does not put the character in the box there is nowhere
# else it could have gone.
#
# ONE CHECK. "choosing it opens the emoji row" passes — opening is exactly what
# still works — and only the check that reads the composer's value fails. That
# pair is this suite's whole method, stated in its header: "no check here stops
# at 'the item is in the menu' — each one follows the item to the thing it
# claims to do."
#
# Reddens: comment-plus-menu: "and the emoji lands in the comment being written"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                onClick={() => {
                  setText((prev) => prev + e)
                  setEmojiOpen(false)
                  commentTextRef.current?.focus()
                }}
"""
b = """                onClick={() => {
                  setEmojiOpen(false)
                  commentTextRef.current?.focus()
                }}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the emoji row inserts nothing.')
