# SAVING A TEMPLATE LEAVES THE CENTER'S COUNTS AS THEY WERE (`ledger-rows/row-1874`).
#
# The save succeeds and the browse is not asked again, so the Tags and Created
# by menus keep the numbers from before it — until the cache happens to go
# stale, thirty seconds later, which is long enough for anybody to believe it.
#
# Reddens: template-center: "and the Tags facet counts its tags too — Q3 7, Launch day 1"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
a = """      toast.success(t('templates.savedToast'))
      qc.invalidateQueries({ queryKey: ['project-templates'] })
"""
b = """      toast.success(t('templates.savedToast'))
      // BROKEN: the browse is not asked again after a save
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-26-save-leaves-counts-stale: a save does not refresh the facets')
