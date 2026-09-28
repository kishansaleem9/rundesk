# The App Center's facet rail cut back to the nine it shipped with. Frame
# `19:07` draws fourteen under an INTEGRATIONS heading; nine of them is seven
# directories with no door, and two of the nine ("Installed", "AI") are not
# facets in the frame at all.
# Reddens: integration-error-card:
#   "and so is every one of the fourteen category chips frame `19:07` draws"
#   "and every one of them can return something — no chip that only empties the grid"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
a = """const FACETS = FRAME_FACETS.filter((facet) => INTEGRATIONS.some((i) => matchesFacet(i, facet.id)))
"""
b = """const FACETS = FRAME_FACETS.filter((facet) =>
  ['all', 'comms', 'storage', 'dev', 'calendar', 'analytics', 'crm'].includes(facet.id),
)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-integrations-page.tsx: the facet rail is back to a hand-written short list.')
