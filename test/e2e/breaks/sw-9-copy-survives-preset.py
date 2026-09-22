# A copied configuration outlives the card it customised, so the Space is built from a mixture nobody chose.
# Reddens: space-wizard: "choosing a workflow card drops the copy"
import io
p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = '    setViews(null); setDefaultView(null); setFeatures(null)\n    // A copied configuration IS a customisation of the old card, so it goes\n'
b = '    // A copied configuration IS a customisation of the old card, so it goes\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-space-wizard.tsx: A copied configuration outlives the card it customised, so the Space is built from a mixture nobody chose.')
