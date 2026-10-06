# THE CLICKUP ENRICHMENT ASKS NOTHING OF THE TASKS IT WRITES INTO (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`).
# Reddens: unit: clickup-import.enrich.test.ts "a task its importer may not open takes nothing, and a refused comment or file rule takes nothing of its kind: each refusal is reported in its words, and ClickUp is not asked for what is refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      const refused = await this.access.enrichmentRefusals(this.db, { workspaceId, taskId, importer })\n'
b = '      const refused = { task: null, comments: null, attachments: null }\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ics-10-clickup-enrichment-asks-nothing-unit: the enrichment writes into every mapped task of the workspace')
