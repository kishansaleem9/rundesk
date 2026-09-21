# The rail rendered straight from the frame's list with no check that anything
# is behind each facet, and the last app in one of those facets removed. This
# is the cheap way to reach fourteen: name them all and let some of them match
# no app. The rail looks right, the COUNT is still right, and a chip that can
# only ever empty the grid ships — because nobody clicks every chip.
# Reddens: integration-error-card:
#   "and every one of them can return something — no chip that only empties the grid"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
pairs = [
  ("""const FACETS = FRAME_FACETS.filter((facet) => INTEGRATIONS.some((i) => matchesFacet(i, facet.id)))
""",
   """const FACETS = FRAME_FACETS.filter(() => true)
"""),
  ("""  { id: 'toggl', name: 'Toggl Track', descKey: 'integrations.desc.toggl', category: 'timeTracking', brandColor: '#E57CD8', logo: 'T' },
""",
   """"""),
]
s = io.open(p, encoding='utf-8').read()
for a, _ in pairs:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
for a, b in pairs:
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('workspace-integrations-page.tsx: the rail keeps every named facet, and Time Tracking now has no app behind it.')
