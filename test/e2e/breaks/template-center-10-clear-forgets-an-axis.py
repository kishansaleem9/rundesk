# "Clear filters" that resets the two checkbox rails and forgets the category
# heading. The two facets a person is looking straight at go back to normal,
# the fourth axis quietly stays on, and the only thing on screen that says so
# is the heading's own pressed state.
import io
p='/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
s=io.open(p,encoding='utf-8').read()
a="onClick={() => { setTypes([]); setComplexities([]); setUseCase(''); setCategory('') }}"
assert s.count(a)==1, 'anchor not found exactly once'
io.open(p,'w',encoding='utf-8').write(
    s.replace(a,"onClick={() => { setTypes([]); setComplexities([]); setUseCase('') }}"))
print('BREAK 10: Clear filters no longer clears the category axis')
