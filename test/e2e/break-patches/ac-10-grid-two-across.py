# The frame’s 2×4 collapsed to a 4×2, at a width where four fit.
# Reddens: ai-action-categories: "the grid is four columns wide at 1440px" / "two rows of four"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-value-panel.tsx'
a = '              className="grid grid-cols-2 gap-px bg-border xl:grid-cols-4"'
b = '              className="grid grid-cols-2 gap-px bg-border"'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-value-panel.tsx: the category grid never widens past two columns.')
