# UPDATING A PROJECT TAKES ANY FOLDER AGAIN: another space's, or another workspace's.
# Reddens: project-folder-home: "a project takes no folder of another workspace (400), and stays out of it"
#   or "nor a folder of another space of its own workspace (400)"
import io
p = '/home/user/rundesk/apps/api/src/modules/projects/projects.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      await this.assertFolderOfSpace(data.folderId, own.spaceId)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "      void own\n"))
print('pfh-1-update-asks-no-folder-home: update takes any folder')
