# The comment posts and the chosen assignment is never sent.
#
# THE ONE THIS SUITE IS REALLY FOR. Its header says the hover action on a
# POSTED comment already existed and "assigning the comment you are WRITING did
# not" — so the whole item is this `if (assignTo)` block, and this patch is the
# item not being built while looking exactly as though it were.
#
# Everything a person can see is right: the menu row opens the picker, the
# picker takes a name, the composer says who it will go to before you post, the
# comment posts. The only thing missing is the request, and there is no toast to
# notice either — the success toast lives inside the block that goes.
#
# That is why the check reads `assigned_to_user_id` out of `task_comments`
# rather than looking at the thread. A posted comment with no assignment looks
# identical to one that was never assigned, and the person who chose a name has
# already been told, by the composer, that it was taken.
#
# ONE CHECK, THE LAST. The three above it — the picker opens, the pending line
# appears, the comment posts — are all still true, which is the whole
# difficulty.
#
# Reddens: comment-plus-menu: "and the posted comment really carries the assignment"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """        try {
          await api(`/tasks/${taskId}/comments/${posted.id}/assign`, {
            method: 'POST',
            body: { userId: assignTo },
          })
          toast.success(t('commentPlus.assignedOnPost', { name }))
        } catch {
          toast.error(t('commentPlus.assignFailed'))
        }
"""
b = """        void name
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the chosen assignment is dropped when the comment posts.')
