# The create menu opens straight onto the tab strip again, with nothing over it.
# Reddens: create-menu-ai: "the create menu opens with the frame's own sentence over
#   it"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '            <input\n              value={query}\n              onChange={(e) => setQuery(e.target.value)}\n              data-testid="create-search"\n'
b = '            <input\n              value={query}\n              onChange={(e) => setQuery(e.target.value)}\n              data-testid="create-search-removed"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The create menu opens straight onto the tab strip again, with nothing over it.')
