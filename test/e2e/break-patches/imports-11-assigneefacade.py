# Check 11 — count the assignee and never write the row. The report says one
# person was linked; task_assignees is empty. The facade, exactly.
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      await this.db.insert(taskAssignees).values({ taskId, userId }).onConflictDoNothing()'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '      void taskId // BROKEN: counted, never written'))
print('BROKE check 11: assignees are counted but never linked')
