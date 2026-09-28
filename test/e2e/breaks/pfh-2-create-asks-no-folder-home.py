# MAKING A PROJECT TAKES ANY FOLDER AGAIN: it is made under another workspace's.
# Reddens: project-folder-home: "a project is not made under another workspace's folder (400), and nothing is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/projects/projects.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (data.folderId) await this.assertFolderOfSpace(data.folderId, spaceId)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ''))
print('pfh-2-create-asks-no-folder-home: create takes any folder')
