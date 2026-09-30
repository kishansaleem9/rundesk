# A COMMENT'S FILES COME BACK NEWEST FIRST (`found-30-sep/comment-files-unordered`): an order,
# but not the task's own. The Attachments tab lists a task's files oldest first, and a comment's
# files, read in the other direction, are drawn the other way round from the order they were attached.
# Reddens: task-attachments: "and the comment draws them in that order"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = ("      .where(and(eq(taskAttachments.taskId, taskId), inArray(taskAttachments.commentId, commentIds)))\n"
     "      .orderBy(...ATTACHMENT_ORDER)\n")
b = ("      .where(and(eq(taskAttachments.taskId, taskId), inArray(taskAttachments.commentId, commentIds)))\n"
     "      .orderBy(desc(taskAttachments.createdAt), desc(taskAttachments.id)) // BROKEN: newest first\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cfo-2-comment-files-newest-first: a comment\'s files are read newest first')
