# ANYTHING IS MADE IN THE PERSONAL SPACE.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: unit: container-access.test.ts "takes tasks, and nothing else: no list, folder, project, doc or sprint is made in it"
#
# The create gate asks nothing of the personal space, so a list or a folder is made beside a Personal List.
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  if (params.kind !== 'task' && (await isPersonalSpace(db, params.spaceId))) throw new ForbiddenException(PERSONAL_PLACE_HOLDS_TASKS)\n",
     "  if (params.kind !== 'task' && false) throw new ForbiddenException(PERSONAL_PLACE_HOLDS_TASKS) // BROKEN: anything is made there\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-19-anything-is-made-in-it-unit: ANYTHING IS MADE IN THE PERSONAL SPACE.')
