# Both view chips link to the same place. They read differently — "… > List" and
# "… > Board" — and open the same tab, so the sentence's "or the Board to manage work
# by status" is a promise the link does not keep.
# Reddens: ai-answer-rendering: "each opening its OWN tab of that list — two chips, two different links"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "        (view && viewEnabled ? `?view=${view}` : '')"
b = "        ''"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: view chips no longer carry the view they name.')
