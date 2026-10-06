# THE ENRICHMENT ASKS NO READ RULE (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`): a task its importer may not open goes to the comment rule,
# which asks the level alone.
# Reddens: unit: import-access.test.ts "a task its importer may not open is refused whole, in the read rule’s words, and neither of the other rules is asked"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-access.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (!(await rules.readable(db, workspaceId, taskId, importer))) {\n    return { task: MAY_NOT_OPEN, comments: MAY_NOT_OPEN, attachments: MAY_NOT_OPEN }\n  }\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iac-9-the-enrichment-asks-no-read-rule-unit: the enrichment asks no read rule')
