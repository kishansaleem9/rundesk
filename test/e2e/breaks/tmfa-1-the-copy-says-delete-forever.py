# The archive confirmation goes back to the words it used to have: "Delete this
# task? This cannot be undone."
#
# The defect as found, and the suite's header explains why it was invisible:
# archiving already worked everywhere — `DELETE /tasks/:id` set `isArchived`,
# stamped `archivedAt`, logged the activity as `archived`, listed the task under
# `archived-tasks` and restored it with `POST /tasks/:id/restore`. "Every layer
# called that archiving except the button, which called it Delete."
#
# So this patch changes nothing about what happens. The task is archived, the
# timestamp is stamped, the restore works — and the only thing anybody is told
# is that their task is gone for ever. A reversible action presented as
# permanent is one nobody uses, which is how a feature that exists in five
# layers can be missing from a product.
#
# It is a STRING, in a catalogue of eleven thousand of them, and nothing in the
# type system connects it to the mutation it describes. That is the whole
# argument for asserting the dialog text rather than the outcome.
#
# REDDENS THE TWO CHECKS THAT READ THE DIALOG. Both of them, because the old
# copy fails on each count separately — it says delete rather than archive, and
# it claims the action cannot be undone. Everything after it stays green: the
# row is archived, stamped and restorable, which is exactly the contradiction
# the item existed to remove.
#
# Reddens: task-menu-favorite-archive: "it asks about archiving, not deleting"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = "  'taskDetail.confirmArchiveTask': 'Archive this task? It is kept, and you can restore it from Archived tasks in workspace settings.',"
b = "  'taskDetail.confirmArchiveTask': 'Delete this task? This cannot be undone.',"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('catalogs.ts: the archive confirmation claims the task cannot be recovered.')
