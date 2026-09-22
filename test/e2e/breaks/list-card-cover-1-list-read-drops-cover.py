# THE DEFECT, back: the cover reaches exactly one surface.
#
# `getTask` keeps resolving `coverUrl`, so `task-cover.mjs` stays green and the
# detail sheet still shows the banner. The LIST read hands back the raw
# columns, which a card cannot use — a storage key is not an image address.
# This is the shape the bug had, and the shape that survived a passing suite.
#
# Reddens list-card-cover: "a linked cover comes back from the list read byte
# for byte", "the card carries a cover band", "the image it draws is the one
# that was set", "the colour-covered card draws a colour band" and both
# measured checks.
#
# Reddens: list-card-cover: "a linked cover comes back from the list read byte for byte"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      coverUrl: coverUrlByTask.get(r.id) ?? null,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ""))
print('tasks.service.ts: getTasksByList no longer returns coverUrl — the single-task read still does.')
