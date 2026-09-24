# A ROW'S CONTAINER RULE ASKS NOTHING OF ITS FOLDER AGAIN: a private folder's project, lists and tasks open by id.
# Reddens: private-folder-reach: "a task inside the private folder is refused to the member — the open folder’s task opens, and the admin opens it"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.guard-helper.ts'
a = "    if (folder?.visibility === 'private' && folder.createdById !== actor.userId) return 'folder'\n"
b = '    void folder\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("pfr-1-the-folder-is-not-asked: applied")
