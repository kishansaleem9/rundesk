# Delete answers and removes nothing.
# Reddens: brain-comments-and-decks: "deleted, the deck goes, every version with it, and it leaves the list"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/artifacts.service.ts'
a = '    await this.db.delete(aiArtifacts).where(eq(aiArtifacts.id, row.id))\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-28-delete-keeps-the-deck: Delete answers and removes nothing.')
