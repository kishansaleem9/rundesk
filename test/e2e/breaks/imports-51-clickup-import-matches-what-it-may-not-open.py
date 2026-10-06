# THE CLICKUP IMPORT MATCHES TASKS ITS IMPORTER MAY NOT OPEN (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`):
# its index is read as a platform admin's, so a merge names a private list's task, and its refusal says it is there.
# Reddens: imports: "a merge by a member granted workspace.import matches no task they may not open — both importers, with a space named and without: a private list’s task, a private space’s and a private task stay as they were, and each row is imported as a new task, with no refusal to say the other is there"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      const existing = await this.access.matchableTaskIndex(this.db, { workspaceId, targetSpaceId: dto.targetSpaceId, importer })\n'
b = "      const existing = await this.access.matchableTaskIndex(this.db, { workspaceId, targetSpaceId: dto.targetSpaceId, importer: { ...importer, role: 'super_admin' } })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-51-clickup-import-matches-what-it-may-not-open: the ClickUp import matches tasks its importer may not open')
