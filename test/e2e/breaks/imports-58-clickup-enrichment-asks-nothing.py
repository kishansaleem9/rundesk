# THE CLICKUP ENRICHMENT ASKS NOTHING OF THE TASKS IT WRITES INTO (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`): a private space's task and
# a view-only space's are enriched for a member who may neither open the one nor comment on the other.
# Reddens: imports: "the ClickUp enrichment by a member granted workspace.import takes nothing into a private space’s task they may not open, nor into a view-only space’s task they may not comment on or change — each refused in its rule’s words, before ClickUp is asked"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      const refused = await this.access.enrichmentRefusals(this.db, { workspaceId, taskId, importer })\n'
b = '      const refused = { task: null, comments: null, attachments: null }\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-58-clickup-enrichment-asks-nothing: the enrichment writes into every mapped task of the workspace')
