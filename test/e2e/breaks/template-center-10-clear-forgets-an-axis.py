# "Clear filters" that resets the two checkbox rails and forgets the category
# heading. The two facets a person is looking straight at go back to normal,
# the fourth axis quietly stays on, and the only thing on screen that says so
# is the heading's own pressed state.
#
# Re-aimed for `ledger-rows/row-1874`: the same line now clears Tags and
# Created by as well, and still does after this patch — only the category goes.
#
# Reddens: template-center: "and every one of the four axes reads cleared — the rail, the dropdown and the category heading, not just the grid"
import io
p='/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
s=io.open(p,encoding='utf-8').read()
a="onClick={() => { setTypes([]); setComplexities([]); setUseCase(''); setCategory(''); setTag(''); setCreatedBy('') }}"
assert s.count(a)==1, 'anchor not found exactly once'
io.open(p,'w',encoding='utf-8').write(
    s.replace(a,"onClick={() => { setTypes([]); setComplexities([]); setUseCase(''); setTag(''); setCreatedBy('') }}"))
print('BREAK 10: Clear filters no longer clears the category axis')
