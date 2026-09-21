# The save is written and never read back, so the control forgets on reload.
#
# `getComments` stops looking up which comments this viewer has saved, so every
# row comes back unsaved however many times it was bookmarked. The write works,
# the table fills up, and the button is wrong the moment the page reloads —
# the mirror defect, a stored value no reader honours.
#
# Reddens: save-comment: "a reload still shows the comment as saved"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = """      const saves = await this.db
        .select({ commentId: taskCommentSaves.commentId })
        .from(taskCommentSaves)
        .where(and(
          eq(taskCommentSaves.userId, viewerId),
          inArray(taskCommentSaves.commentId, commentIds),
        ))
      for (const s of saves) savedIds.add(s.commentId)
"""
b = """      void taskCommentSaves
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: a saved comment is never reported as saved.')
