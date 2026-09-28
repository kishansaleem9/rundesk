# The panel's Closed switch moves and tells nobody. It flips, it looks right,
# and the list keeps every closed task — a labelled control over a filter it
# does not reach.
# Reddens: list-customize: ") const closedBefore = (await closedGroup().count()) === 1 ? await closedGroup().getAttribute('data-count') : null await flip('list-show-closed') const chipAfterPanel = await chipActive() chk( chipAfterPanel === 'true', 'turning the panel switch off moves the toolbar chip with it',"
import io
p = "/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx"
a = "              onShowClosed={setShowClosed}"
b = "              onShowClosed={() => {}}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('the panel switch writes nowhere — the chip and the rows never hear about it.')
