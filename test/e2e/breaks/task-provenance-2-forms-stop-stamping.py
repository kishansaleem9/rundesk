# The form router stops setting `taskTypeId` on the task it creates.
#
# This is the state Rundesk was in from the day forms shipped until §V2-04: the
# submission became a task, the task's title read "Form submission: …", and
# that prose was the entire record of where it came from — invisible to the
# type filter, to the list badge, and to anyone scanning for what arrived from
# the website this week.
#
# The task still gets a type, because `createTask` falls back to the list's
# default, so the row is not obviously wrong. It simply says Task, like
# everything else, which is why this went unnoticed for as long as it did and
# why the check has to compare against the form type's id rather than assert
# that a type is present at all.
#
# REDDENS TWO, BOTH OF THEM STAMPING CHECKS. The type still exists with its
# origin marker, so the first two checks pass; the submission still routes, so
# the two before the stamp pass; the rename still works. What fails is the
# stamp, before and after the rename — which is the right pair, because this
# patch is not about renaming at all.
#
# Reddens: task-provenance: "the task carries the type that means \"a form made this\""
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/forms.service.ts'
a = "        taskTypeId: await taskTypeIdForOrigin(this.db, targetList.workspaceId, 'form'),\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('forms.service.ts: a routed submission no longer says a form made it.')
