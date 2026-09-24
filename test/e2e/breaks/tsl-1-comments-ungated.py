# A COMMENT ASKS NOTHING OF THE SPACE, as it did: "view only" takes comments.
# Reddens: task-space-levels: "in a “view only” space a member cannot comment (403, none written) — in an “edit” space they do"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    this.assertNotInBin(target.isArchived)\n    await this.assertSpaceAllowsComments(taskId, authorId)\n'
b = '    this.assertNotInBin(target.isArchived)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tsl-1-comments-ungated: applied")
