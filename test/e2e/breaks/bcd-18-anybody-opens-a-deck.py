# A deck opens for anybody who has its id.
# Reddens: brain-comments-and-decks: "a deck is its asker’s own: another member is told it is not there and does not list it, and a guest is refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/artifacts.service.ts'
a = '      .where(and(eq(aiArtifacts.id, id), eq(aiArtifacts.createdById, userId)))\n'
b = '      .where(eq(aiArtifacts.id, id))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-18-anybody-opens-a-deck: A deck opens for anybody who has its id.')
