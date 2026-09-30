# AN ARCHIVED WORKSPACE'S CLIP LINKS GO ON PLAYING (`resume-defects/resume-7`).
#
# The workspace has left its own members' list, and its clips are still
# handed to anybody holding a link.
#
# Reddens: unit: clips.service.test.ts "closes while its workspace is archived, and nothing is signed"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = "    if (!row || row.workspaceArchived) throw new NotFoundException('Clip not found')\n"
b = "    if (!row) throw new NotFoundException('Clip not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-18-an-archived-workspace-still-plays-unit: an archived workspace\'s clips still play')
