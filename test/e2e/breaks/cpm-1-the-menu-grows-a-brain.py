# "Brain" joins the "+" menu as a row that does nothing.
#
# The suite calls the check this reddens "the check that keeps the menu
# honest", and the re-audit's own reason for leaving two of the frame's ten
# items out is that they "have NO ENGINE, so they are deliberately absent
# rather than present as labels."
#
# So this is the facade in its cheapest form: a `DropdownMenuItem` with an
# icon, a label and `onSelect={() => {}}`. Ten of ten items, exactly as the
# frame lists them, and one of them is a place that does not exist. A
# screenshot review passes it; the person who presses it learns the menu is
# unreliable and stops trusting the other nine.
#
# It is the likeliest single edit anybody makes to this file. The frame lists
# ten and the menu shows nine, which reads as an oversight rather than a
# decision — the decision is three paragraphs away in the suite and one comment
# away in the component.
#
# ONE CHECK. Every other item still works; the count check passes, because the
# nine buildable items are all still there and it asks about those nine. Only
# the check that names what must NOT be in the menu fails — which is why that
# check is phrased as an absence.
#
# Reddens: comment-plus-menu: "and Brain, which has nothing behind it, is still absent"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """          <DropdownMenuItem data-testid="comment-plus-emoji" onSelect={onEmoji}>
            <Smile className="mr-2 h-4 w-4" />
            {t('commentPlus.addEmoji')}
          </DropdownMenuItem>
"""
b = """          <DropdownMenuItem data-testid="comment-plus-emoji" onSelect={onEmoji}>
            <Smile className="mr-2 h-4 w-4" />
            {t('commentPlus.addEmoji')}
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="comment-plus-brain" onSelect={() => {}}>
            <Smile className="mr-2 h-4 w-4" />
            Brain
          </DropdownMenuItem>
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the "+" menu now offers Brain, which does nothing.')
