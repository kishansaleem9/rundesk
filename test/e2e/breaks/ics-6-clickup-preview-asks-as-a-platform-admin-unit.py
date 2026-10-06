# THE CLICKUP PREVIEW READS ITS INDEX AS A PLATFORM ADMIN (`found-6-oct/import-previews-tell-what-private-places-hold`).
# Reddens: unit: clickup-import.service.test.ts "the preview counts duplicates among the tasks its importer may open: it asks for those as the importer (found-6-oct/import-previews-tell-what-private-places-hold)"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    const { rows, customFieldColumns } = parseClickUpCsv(dto.csv ?? '')\n\n    const existing = await this.access.matchableTaskIndex(this.db, { workspaceId, targetSpaceId: dto.targetSpaceId, importer })\n"
b = "    const { rows, customFieldColumns } = parseClickUpCsv(dto.csv ?? '')\n\n    const existing = await this.access.matchableTaskIndex(this.db, { workspaceId, targetSpaceId: dto.targetSpaceId, importer: { ...importer, role: 'super_admin' } })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ics-6-clickup-preview-asks-as-a-platform-admin-unit: the ClickUp preview counts tasks its asker may not open')
