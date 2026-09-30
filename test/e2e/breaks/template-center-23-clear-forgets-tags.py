# "CLEAR FILTERS" LEAVES THE TAG CHOSEN (`ledger-rows/row-1874`).
#
# The four older axes and Created by are reset, the Tags menu keeps its value,
# and the grid it narrows is the only sign — the frame's other half of
# `template-center-10`.
#
# Reddens: template-center: "and Tags and Created by read cleared too"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
a = "onClick={() => { setTypes([]); setComplexities([]); setUseCase(''); setCategory(''); setTag(''); setCreatedBy('') }}"
b = "onClick={() => { setTypes([]); setComplexities([]); setUseCase(''); setCategory(''); /* BROKEN: the tag stays */ setCreatedBy('') }}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-23-clear-forgets-tags: Clear filters no longer clears the Tags menu')
