# THE PERSONAL SPACE IS SHAPED LIKE ANY SPACE, BY ITS LISTS' OWNERS AND ITS ADMINS.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: unit: container-access.test.ts "keeps its lists, its container and itself as they are — for the list’s own owner and for an admin"
#
# The manage gate asks nothing of the personal space, so a Personal List is renamed, moved and deleted.
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
print('pls-18-the-personal-space-is-reshaped-unit: THE PERSONAL SPACE IS SHAPED LIKE ANY SPACE.')
