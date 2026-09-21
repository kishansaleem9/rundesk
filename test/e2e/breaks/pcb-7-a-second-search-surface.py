# THE DUPLICATION PATCH. The bar stops opening the shared palette and grows its
# own search box instead. A check asserting "a search field appeared" passes on
# this; only looking for the palette's OWN controls catches it. This is the
# defect that gave this codebase three field-type pickers.
# Reddens: planner-command-bar: "what opened is the shared palette"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '            <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />\n'
b = '            <input data-testid="planner-local-search" placeholder={t(\'planner.commandBar\')} />\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the bar opens a second, local search box.')
