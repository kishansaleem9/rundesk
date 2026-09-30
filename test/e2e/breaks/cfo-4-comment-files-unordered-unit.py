# A COMMENT'S FILES HAVE NO ORDER AGAIN, as `cfo-1`, for the unit test that reads the query
# `listComments` asks (`found-30-sep/comment-files-unordered`).
# Reddens: unit: tasks-attachments-read.test.ts "reads each comment’s files by created_at, then id, as the list does, and hands them on in that order"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = ("      .where(and(eq(taskAttachments.taskId, taskId), inArray(taskAttachments.commentId, commentIds)))\n"
     "      .orderBy(...ATTACHMENT_ORDER)\n")
b = "      .where(and(eq(taskAttachments.taskId, taskId), inArray(taskAttachments.commentId, commentIds)))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cfo-4-comment-files-unordered-unit: listComments asks for no order of a comment\'s files')
