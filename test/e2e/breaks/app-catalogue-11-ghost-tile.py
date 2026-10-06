# A TILE WITH NOTHING BEHIND IT. Basecamp joins the catalogue, and the old
# "coming soon" shape comes back with it: a card whose switch and whose button
# are both dead. It photographs exactly like a working integration.
# RE-AIMED 25 September: the tile's action button was re-indented or renamed (a tile the viewer cannot connect is now a request too, `asks`); the mistake is the same.
# RE-AIMED 6 October: the button is also disabled while the tile's answers are not in (`!known`); the mistake is the same.
# Reddens: app-catalogue: "every one of the N tiles offered can be acted on"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'

a1 = "  { id: 'notion', name: 'Notion', descKey: 'integrations.desc.notion', category: 'knowledge', brandColor: '#111', logo: 'N' },\n"
b1 = (
    "  { id: 'notion', name: 'Notion', descKey: 'integrations.desc.notion', category: 'knowledge', brandColor: '#111', logo: 'N' },\n"
    "  { id: 'basecamp', name: 'Basecamp', descKey: 'integrations.desc.notion', category: 'knowledge', brandColor: '#1D2D35', logo: 'B' },\n"
)

a2 = """                disabled={
                  !known ||
                  isLoading ||
                  (asks &&
                    (accessRequest?.status === 'pending' || accessRequest?.status === 'approved'))
                }
                onClick={() => {
"""
b2 = """                disabled={
                  !known ||
                  isLoading ||
                  !supported ||
                  (asks &&
                    (accessRequest?.status === 'pending' || accessRequest?.status === 'approved'))
                }
                onClick={() => {
"""

s = io.open(p, encoding='utf-8').read()
assert s.count(a1) == 1, f'tile anchor appears {s.count(a1)} times in {p}, expected exactly 1'
assert s.count(a2) == 1, f'button anchor appears {s.count(a2)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a1, b1).replace(a2, b2))
print('workspace-integrations-page.tsx: a Basecamp tile, and every unconnectable tile is dead.')
