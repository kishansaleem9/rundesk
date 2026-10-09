# THE BULK EDITOR ASKS EDIT FOR TAGS ALONE: a tag a person may take off one at a time is refused in bulk.
# (`found-25-sep/view-only-individual-permissions`)
# Reddens: view-only-permissions: "then the member is refused a time estimate, a timer and a logged entry in the switches’ words (403), and nothing of them is saved; puts the tag on and takes it off again, the second by the bulk editor; and makes a view of their own, while a view everybody shares is still refused for the level"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("          await this.assertTaskWriteAccess(taskId, actorId, tagsOnly ? { orViewOnly: 'tags' } : {})\n",
     "          await this.assertTaskWriteAccess(taskId, actorId, tagsOnly && false ? { orViewOnly: 'tags' as const } : {}) // BROKEN: the bulk editor asks edit for tags\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('vop-6-the-bulk-editor-asks-edit-for-tags: the bulk editor asks edit for tags')
