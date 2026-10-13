# The deck Brain made is named on the wire and drawn nowhere.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "the deck is drawn as a card under the answer, as frame 16:50 draws it: its title and "4 slides""
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = '              if (parsed.artifact?.id) {\n'
b = '              if (false) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-22-no-deck-card: The deck Brain made is named on the wire and drawn nowhere.')
