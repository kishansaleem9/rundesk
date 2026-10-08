# A CLICKUP MERGE WRITES A VALUE ON THE RUN'S OWN FIELD, READ FROM ITS UNIT TEST (`found-6-oct/clickup-merge-writes-values-to-fields-the-task-lacks`).
#
# Reddens: unit: clickup-import.service.test.ts "a merged task’s value goes on its own field of that name; a value it has no field for, or one its dropdown does not offer, is reported and not written"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
a = "    if (how.merged) {\n      await this.applyOwnFieldValues(taskId, t, summary)\n      return\n    }\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('imports-79-a-merged-value-goes-on-the-runs-field-unit: a merged task takes the run’s fields')
