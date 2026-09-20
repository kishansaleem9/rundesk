# A facet with nothing behind it left tickable. It still says 0; ticking it is
# still a control whose only possible effect is to empty an empty grid.
import io
p='/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
s=io.open(p,encoding='utf-8').read()
a="                disabled={empty}\n"
assert s.count(a)==1, 'anchor not found exactly once'
io.open(p,'w',encoding='utf-8').write(s.replace(a,''))
print('BREAK 7: zero-count facets are no longer disabled')
