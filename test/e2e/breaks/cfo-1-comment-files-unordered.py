# A COMMENT'S FILES COME BACK IN HEAP ORDER AGAIN (`found-30-sep/comment-files-unordered`).
# `listComments` reads each comment's files with no ORDER BY, so a comment whose files sit in
# the heap in another order than they were attached hands them back, and draws them, that way.
# Reddens: task-attachments: "a comment hands its files back in the order they were attached, oldest first — not in the order the heap holds them"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = ("      .where(and(eq(taskAttachments.taskId, taskId), inArray(taskAttachments.commentId, commentIds)))\n"
     "      .orderBy(...ATTACHMENT_ORDER)\n")
b = "      .where(and(eq(taskAttachments.taskId, taskId), inArray(taskAttachments.commentId, commentIds)))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cfo-1-comment-files-unordered: a comment\'s files are read in heap order')
