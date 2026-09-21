# The bottom bar stops opening the shared command palette and grows a search box of its
# own: two result lists, two sets of filters, two ideas of what a command is. The
# duplicated-list defect at the largest scale this codebase has seen it - frame `14:45`,
# and the whole reason the row was written as a launcher.
# Reddens: planner-command-bar: "and what opened is the shared palette - its source tabs and
#          type picker are both there" (and the checks either side of it)
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '            <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />'
b = '            <div role="dialog" className="fixed inset-0 z-50 bg-background p-8">\n              <input placeholder="Search" className="w-full rounded border p-2" />\n            </div>'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the bar opens a planner-local search box instead of the palette.')
