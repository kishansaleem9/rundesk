# A Super Agent’s card prints "Made by {name}" again.
# Reddens: brain-comments-and-decks: "a Super Agent’s card says who made it, by name — not "Made by {name}" (found-13-oct/single-brace-placeholders-print-themselves)"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = "  'superAgents.madeBy': 'Made by {{name}}',\n"
b = "  'superAgents.madeBy': 'Made by {name}',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-34-made-by-name-printed: A Super Agent’s card prints "Made by {name}" again.')
