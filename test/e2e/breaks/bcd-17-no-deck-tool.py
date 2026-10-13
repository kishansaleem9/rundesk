# Brain is offered no deck tool: asked for slides, it makes none.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "asked "What’s new in Brain²?", Brain makes a 4-slide deck kept as its asker’s own, and names it on the wire"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '    const canDeck = !!agent && !skillPrompt?.trim() && !!this.artifacts\n'
b = '    const canDeck = false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-17-no-deck-tool: Brain is offered no deck tool: asked for slides, it makes none.')
