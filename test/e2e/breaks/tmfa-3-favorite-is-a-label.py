# The menu's Favorite item stops calling the mutation.
#
# The suite's own failure message is the description: "nothing was written —
# the menu item changed a label and no favourite exists." The star beside the
# "..." still works, so the feature is not missing; it is missing from the one
# place frame `15:25` puts it, while appearing to be there.
#
# That is the shape this whole item is about. Favorite "did exist — a star
# beside the '...' — just not in the menu", and a menu entry wired to nothing
# is the version of adding it that passes a screenshot review: the row is
# there, in the right position, with the right icon and the right label, under
# the Copy row exactly as the frame has it.
#
# REDDENS TWO, AND THE SECOND IS THE CONSEQUENCE OF THE FIRST: no row is
# written, so the label on reopening is still "Add" — correctly, this time,
# which is worth noticing. The star check fails too for the same reason. The
# three Archive checks are untouched.
#
# Reddens: task-menu-favorite-archive: "choosing it pins the task for real, not just on screen"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                        data-testid="task-menu-favorite"
                        onSelect={() =>
                          toggleFavorite.mutate({ entityType: 'task', entityId: detailQuery.data!.id })
                        }
"""
b = """                        data-testid="task-menu-favorite"
                        onSelect={() => {}}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the menu\'s Favorite item writes nothing.')
