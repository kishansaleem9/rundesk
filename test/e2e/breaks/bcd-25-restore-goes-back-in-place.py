# Restoring points the deck back at the old version: no new one is written.
# Reddens: brain-comments-and-decks: "restoring version 1 writes it again as the newest, version 3, and nothing after it is lost"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/artifacts.service.ts'
a = '    return this.addVersion(row.id, userId, { title: old.title, slides: old.slides }, `Restored version ${version}`, version)\n'
b = '    await this.db.update(aiArtifacts).set({ currentVersion: version }).where(eq(aiArtifacts.id, row.id))\n    return this.getMine(id, userId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-25-restore-goes-back-in-place: Restoring points the deck back at the old version: no new one is written.')
