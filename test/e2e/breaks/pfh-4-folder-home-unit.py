# THE FOLDER'S SPACE IS NOT ASKED: a folder anywhere is taken (unit).
# Reddens: unit: projects.service.test.ts "refuses a folder of another space — or another workspace — (400), and writes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/projects/projects.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (!folder || folder.spaceId !== spaceId) throw new BadRequestException('That folder does not belong to this space')\n"
b = "    if (!folder) throw new BadRequestException('That folder does not belong to this space')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pfh-4-folder-home-unit: the folder need only exist')
