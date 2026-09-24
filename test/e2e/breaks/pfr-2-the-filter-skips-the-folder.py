# THE CONTAINER RULE IN SQL ASKS NOTHING OF A PROJECT'S FOLDER AGAIN: the lists read a private folder's tasks.
# Reddens: private-folder-reach: "the workspace list finds the member nothing inside the private folder — and finds the admin its task"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.guard-helper.ts'
a = '    or(isNull(projects.folderId), notInArray(projects.folderId, hiddenFolders)),\n'
b = '    notInArray(projects.folderId, hiddenFolders) ? undefined : undefined,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("pfr-2-the-filter-skips-the-folder: applied")
