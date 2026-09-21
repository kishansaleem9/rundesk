# The card drawn OVER the rows rather than beside them, as `[17:16]` draws it. It
# still contains everything it should and it covers the list it is describing, so the
# comparison the bars exist for cannot be made.
# Reddens: ai-model-cards: "and drawn beside the row rather than over the list"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = 'className="pointer-events-none absolute left-full top-0 z-[70] ml-2 w-56 rounded-lg border border-border bg-popover p-3 shadow-xl"'
b = 'className="pointer-events-none absolute left-0 top-0 z-[70] w-56 rounded-lg border border-border bg-popover p-3 shadow-xl"'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the hover card now sits over the row list instead of beside it.')
