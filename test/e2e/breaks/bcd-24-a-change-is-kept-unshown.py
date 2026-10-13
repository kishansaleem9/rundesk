# A new version is written and the deck goes on showing the old one.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "asked to change it, Brain makes the whole deck again as a new version, shown at its first slide"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/artifacts.service.ts'
a = '    await this.db.update(aiArtifacts).set({ title: deck.title, currentVersion: version, updatedAt: new Date() }).where(eq(aiArtifacts.id, row.id))\n'
b = '    await this.db.update(aiArtifacts).set({ updatedAt: new Date() }).where(eq(aiArtifacts.id, row.id))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-24-a-change-is-kept-unshown: A new version is written and the deck goes on showing the old one.')
