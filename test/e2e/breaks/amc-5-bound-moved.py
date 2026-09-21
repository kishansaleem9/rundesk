# The frame's "Best models" holds THREE rows. Move the bound to two and the popover
# draws a different picture from the one `[17:16]` draws, with a routable tier pushed
# behind a disclosure it was never meant to be behind.
# Reddens: ai-model-cards: "headed by the three rows the frame draws, at the bound the server declares"
#          ai-model-picker: "with exactly the three pickable tiers the frame draws before the disclosure"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/model-tiers.ts'
a = "export const BEST_MODELS_VISIBLE = 3"
b = "export const BEST_MODELS_VISIBLE = 2"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('model-tiers.ts: the visible group now holds two, not the frame\'s three.')
