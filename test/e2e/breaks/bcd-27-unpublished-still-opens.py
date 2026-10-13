# Unpublishing keeps the link working.
# Reddens: brain-comments-and-decks: "unpublished, the same link opens nothing, and says so"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/artifacts.service.ts'
a = '    await this.db.update(aiArtifacts).set({ publishToken: null, publishedAt: null, updatedAt: new Date() }).where(eq(aiArtifacts.id, row.id))\n'
b = '    await this.db.update(aiArtifacts).set({ updatedAt: new Date() }).where(eq(aiArtifacts.id, row.id))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-27-unpublished-still-opens: Unpublishing keeps the link working.')
