# "New Doc" opens the quick-create modal on the TASK tab.
#
# The row is right, the modal opens, and you are one click from the wrong
# thing — the same shape as `comment-plus-mention-task` opening the People tab,
# which this suite already has a check for and a comment about scoping it
# properly.
#
# `onQuickCreate('doc')` becomes `onQuickCreate('task')`, which is the mistake a
# copy-and-paste of the row above it leaves behind: the three "New …" items are
# identical but for that one string, and `task` is the one already on the
# clipboard.
#
# THIS PATCH IS WHY THE CHECK BESIDE IT HAD TO BE REWRITTEN. "The quick-create
# modal opens" read `|| (await readText(page.locator('body'))).includes('doc')`
# as a fallback, and the task sheet behind the modal says "doc" in several
# places — Docs relation, Linked docs, Related items — so it was true whether
# or not the modal opened, let alone which tab it opened on. It addresses
# `create-tab-doc` now, which exists only inside the modal, and asserts its
# `aria-pressed` — the tab claim that this section's own heading makes and
# nothing checked.
#
# ONE CHECK. The modal still opens, so the check above stays green; only the
# tab is wrong.
#
# Reddens: comment-plus-menu: "and it lands on the Doc tab, which is the row that was pressed"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """          <DropdownMenuItem data-testid="comment-plus-new-doc" onSelect={() => onQuickCreate('doc')}>"""
b = """          <DropdownMenuItem data-testid="comment-plus-new-doc" onSelect={() => onQuickCreate('task')}>"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: "New Doc" opens the creator on the Task tab.')
