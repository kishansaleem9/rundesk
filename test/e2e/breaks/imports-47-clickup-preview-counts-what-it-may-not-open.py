# THE CLICKUP PREVIEW COUNTS EVERY TASK AS A DUPLICATE (`found-6-oct/import-previews-tell-what-private-places-hold`): its index
# is read as a platform admin's, so a private space's task and a private list's are counted.
# RE-AIMED 6 October: the preview parses a body it has asked is text (`found-6-oct/import-start-answers-500-to-non-text`); the mistake is the same.
# Reddens: imports: "for a member granted workspace.import, both previews count as a duplicate only the task they may open — not a private space’s task, a private list’s or a private task"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    const { rows, customFieldColumns } = parseClickUpCsv(dto.csv)\n\n    const existing = await this.access.matchableTaskIndex(this.db, { workspaceId, targetSpaceId: dto.targetSpaceId, importer })\n"
b = "    const { rows, customFieldColumns } = parseClickUpCsv(dto.csv)\n\n    const existing = await this.access.matchableTaskIndex(this.db, { workspaceId, targetSpaceId: dto.targetSpaceId, importer: { ...importer, role: 'super_admin' } })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-47-clickup-preview-counts-what-it-may-not-open: the ClickUp preview counts tasks its asker may not open')
