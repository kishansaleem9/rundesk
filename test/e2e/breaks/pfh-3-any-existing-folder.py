# THE FOLDER NEED ONLY EXIST: whose space it is in is not asked.
# Reddens: project-folder-home: "a project takes no folder of another workspace (400), and stays out of it"
#   or "nor a folder of another space of its own workspace (400)"
#   or "a project is not made under another workspace's folder (400), and nothing is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/projects/projects.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (!folder || folder.spaceId !== spaceId) throw new BadRequestException('That folder does not belong to this space')\n"
b = "    if (!folder) throw new BadRequestException('That folder does not belong to this space')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pfh-3-any-existing-folder: the folder need only exist')
