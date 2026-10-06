# AN IMPORT ASKS THE SPACE'S LEVEL AND NOT WHETHER ITS IMPORTER CAN SEE THE SPACE (`found-5-oct/import-writes-into-another-workspace`):
# a private space a member cannot open takes their import, as its default level is Full edit.
# Reddens: imports: "nor into a private space they cannot open: both importers refuse, 403 “You do not have access to where this project would go”, and nothing is written there"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-target.ts'
s = io.open(p, encoding='utf-8').read()
a = "import { assertCanPlaceIn } from '../../../common/permissions/container-access'\n"
b = "import { assertCanPlaceIn, assertCanCreateInSpace } from '../../../common/permissions/container-access'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = "  await place(db, { spaceId: space.id, actorId: params.actorId, kind: 'project' })\n"
b = "  await assertCanCreateInSpace(db, { spaceId: space.id, actorId: params.actorId, kind: 'project' })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imports-24-import-sees-private-spaces: an import skips the container rule")
