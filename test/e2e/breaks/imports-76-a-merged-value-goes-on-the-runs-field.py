# A CLICKUP MERGE WRITES A VALUE ON THE RUN'S OWN FIELD, WHICH THE TASK DOES NOT HAVE (`found-6-oct/clickup-merge-writes-values-to-fields-the-task-lacks`).
#
# A merged task takes its values on its own fields (`applyOwnFieldValues`).
# Let it take them on the run's fields, as a new task does, and a value lands
# on a field of the import's project that no page of the task shows, and one
# the task has no field for is written all the same, unreported.
#
# Reddens: imports:
#   "a ClickUp merge writes a value on the task’s own field of that name, and reports one the task has no field for, writing it nowhere"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
a = "    if (how.merged) {\n      await this.applyOwnFieldValues(taskId, t, summary)\n      return\n    }\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('imports-76-a-merged-value-goes-on-the-runs-field: a merged task takes the run’s fields')
