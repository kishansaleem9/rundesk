# Saving a comment reports success and writes no row.
#
# The endpoint still answers `{ commentId, saved: true }`, so the control flips
# to its saved state and the toast names where to find it again — and
# `task_comment_saves` is untouched. A reload puts the button back and nothing
# explains why.
#
# The facade in the shape this suite names: "the button changed and no row was
# written".
#
# WRITTEN AFTER TWO PATCHES AIMED AT THE WRONG SUBSYSTEM ENTIRELY. The suite's
# checks say "Inbox › Later", and I took that for the notification snooze —
# `notifications.snoozedUntil` — and patched that instead. save-comment never
# touches it: it reads `task_comment_saves`, which is its own table with its
# own endpoint. Both patches ran green because they had nothing to do with the
# feature. The rule I had written an hour earlier — read the line the CHECK
# depends on — is exactly the one I skipped, and the line in question is
# `select count(*) from task_comment_saves` on line 149 of the suite.
#
# Reddens: save-comment: "and the save reaches the database"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = """      await this.db
        .insert(taskCommentSaves)
        .values({ commentId, userId })
        .onConflictDoNothing({ target: [taskCommentSaves.commentId, taskCommentSaves.userId] })
      return { commentId, saved: true }
"""
b = """      return { commentId, saved: true }
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: saving a comment reports success and writes nothing.')
