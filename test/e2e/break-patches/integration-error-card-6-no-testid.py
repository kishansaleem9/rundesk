# Back to how the page shipped: nothing in it addressable, so nothing in it
# assertable. This is the state the row was opened over.
# Reddens: "every integration tile is addressable",
#          "with its switch and its button, one of each per tile".
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      data-testid="integration-card"\n'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ''))
print('[break 6] removed the integration tile testid —')
print('          the tiles are unaddressable again.')
