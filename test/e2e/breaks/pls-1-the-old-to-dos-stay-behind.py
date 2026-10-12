# THE OLD CARD’S TO-DOS STAY IN THE OLD CARD.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "the to-dos the old card kept are her Personal List’s first tasks — the done one done — in a private list of hers in the workspace’s personal space, and none is left in the old card (read by SQL)"
#   or "a task made with no list chosen — /task — lands in her Personal List, and Home lists it, the list counting her two open tasks"
#   or "Home’s Personal List draws her tasks — the old to-dos and the task moved in — and the sidebar draws the workspace’s space and no personal one"
#   or "“Open as a list” opens her Personal List as a list, her tasks in it"
#
# Re-aimed 9 October: the last 3 of these are knock-ons of the same edit, measured on lane 9 — checks that stand on what the first ones lost.
#
# A person’s first Personal List starts empty: what Home’s card kept is neither moved nor shown.
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/personal-list.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (todos.length === 0) return\n',
     '  if (todos.length >= 0) return // BROKEN: the old to-dos stay behind\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-1-the-old-to-dos-stay-behind: THE OLD CARD’S TO-DOS STAY IN THE OLD CARD.')
