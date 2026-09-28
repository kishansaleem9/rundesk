# A variant added UNDER an existing testid prefix. `[data-testid^="ai-model-option-"]`
# is a namespace, and the card joining it silently changes what every prefix query in
# the repo counts — the space-wizard 18-for-6 miscount, in the picker.
# Reddens: ai-model-cards: "and the card does not land under the row testid prefix, which would change every count"
#          ai-model-cards: "drawing exactly the rows the server put in Best models"
#          ai-model-picker: "with exactly the three pickable tiers the frame draws before the disclosure"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "          data-testid={`ai-model-card-${model.id}`}"
b = "          data-testid={`ai-model-option-card-${model.id}`}\n          data-available=\"true\""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the hover card now lives under the row testid prefix.')
