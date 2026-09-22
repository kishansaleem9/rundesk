# The list's DEFAULT task type becomes the one marked `origin = 'form'`, so
# every task created without an explicit type is stamped as a form response.
#
# This is the build the suite's control check exists for, stated in its own
# comment: "Without it every check above passes under a build that stamps the
# form type onto EVERY task it creates." Under this patch the form submission
# is stamped, the stamp survives the rename, and all of that is true for the
# uninteresting reason that everything is stamped.
#
# `isDefault` and `origin` are two adjacent boolean-ish markers on the same
# table, and the join that reads one is a single `eq` away from reading the
# other. Nothing in the type system separates them: both are columns on
# `taskTypes`, both narrow the join to one row, and the resulting query is
# valid and returns a real type.
#
# ONE CHECK, THE CONTROL. Nothing else in the suite creates a task without
# naming its type, so nothing else moves — which is what makes the control a
# control rather than a fifth way of asking the same question.
#
# Reddens: task-provenance: "a task a person makes is not stamped as a form response"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      .innerJoin(taskTypes, and(eq(taskTypes.workspaceId, spaces.workspaceId), eq(taskTypes.isDefault, true)))"
b = "      .innerJoin(taskTypes, and(eq(taskTypes.workspaceId, spaces.workspaceId), eq(taskTypes.origin, 'form')))"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: an ordinary new task now defaults to the form-response type.')
