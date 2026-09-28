# Every fill at 100%. The bar can only ever mean one thing, the unfilled remainder the
# frame draws disappears, and "Intelligence 2 out of 5" reads as a full meter.
# Reddens: ai-model-cards: "over a visible track, so a part-filled meter reads as part-filled"
#          ai-model-cards: "and its Speed bar is a visibly different length from the other model’s"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """                    style={{ width: `${Math.min(Math.max(score, 0), 5) * 20}%` }}"""
b = """                    style={{ width: '100%' }}"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: every meter is now full, whatever its score.')
