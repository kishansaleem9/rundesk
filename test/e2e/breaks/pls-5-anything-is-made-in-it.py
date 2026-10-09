# ANYTHING IS MADE IN THE PERSONAL SPACE: LISTS, FOLDERS, DOCS.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "and nothing but tasks is made in its place — a list, a folder, a doc each refused in words (403), and no form files into it (400) — and the owner does not rename the space it lives in (read by SQL)"
#
# The space is Full edit for whoever reaches it, so a list, a folder or a doc is made beside a Personal List.
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
print('pls-5-anything-is-made-in-it: ANYTHING IS MADE IN THE PERSONAL SPACE: LISTS, FOLDERS, DOCS.')
