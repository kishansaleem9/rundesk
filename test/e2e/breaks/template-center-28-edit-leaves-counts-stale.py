# CHANGING A TEMPLATE'S TAGS LEAVES THE TAGS MENU AS IT WAS (`ledger-rows/row-1874`).
#
# The row is written and the browse is not asked again: the menu still offers
# the tag that was taken off, at its old count.
#
# Reddens: template-center: "and the Tags facet follows — Retro 2, and Launch day gone"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
a = """      toast.success(t('templates.tagsSavedToast'))
      // The facet counts move with the tags, so the whole browse is re-asked.
      qc.invalidateQueries({ queryKey: ['project-templates'] })
"""
b = """      toast.success(t('templates.tagsSavedToast'))
      // BROKEN: the browse is not asked again after the tags change
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-28-edit-leaves-counts-stale: a tags edit does not refresh the facets')
