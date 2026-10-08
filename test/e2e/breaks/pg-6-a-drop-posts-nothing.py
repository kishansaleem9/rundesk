# A TASK DROPPED ON THE GRID POSTS NOTHING (`found-8-oct/planner-grid-aims-its-drop-after-one-scroll`).
#
# The drop handler takes the drag it was given only when there is none, so a
# backlog task let go over a day column makes no block. The suite aims its drop
# once the grid has stayed at home and waits for the block's POST, and its three
# drop checks must still fail on a drop that sends nothing, saying where it landed.
#
# Reddens: planner-grid:
#   "dropping it posts a block for that task"
#   "with a start time worked out from where it landed"
#   "rounded to the quarter hour, not to pointer precision"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "  const onDropInColumn = (day: Date, e: React.PointerEvent<HTMLDivElement>) => {\n    if (!dragging) return\n"
b = "  const onDropInColumn = (day: Date, e: React.PointerEvent<HTMLDivElement>) => {\n    if (dragging) return\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pg-6-a-drop-posts-nothing: the drop handler ignores a drop')
