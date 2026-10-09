# A PERSONAL LIST IS RENAMED, MOVED AND DELETED LIKE ANY LIST.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "nobody renames, moves or deletes it: Mia is refused each in words (403), the owner is refused too, its menus are told so, and it is as it was (read by SQL)"
#
# Its owner renames it, moves it into a project of the hierarchy, and deletes it.
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (params.spaceId && (await isPersonalSpace(db, params.spaceId))) throw new ForbiddenException(PERSONAL_PLACE_REFUSAL)\n',
     '  if (params.spaceId && false) throw new ForbiddenException(PERSONAL_PLACE_REFUSAL) // BROKEN: anybody reshapes it\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-4-a-personal-list-is-reshaped: A PERSONAL LIST IS RENAMED, MOVED AND DELETED LIKE ANY LIST.')
