# "Suggest an app" is filed under the facet prefix. A TESTID PREFIX IS A
# NAMESPACE: the frame's fourteen facets become fifteen elements to every
# prefix query in the repo, including the one in integration-error-card.
# Reddens: app-catalogue: "the rail still holds exactly the fourteen facets the
#          frame names" and "\"Suggest an app\" sits under its own AI heading,
#          not among the facets"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
a = '            data-testid="integrations-suggest-app"\n'
b = '            data-testid="integrations-category-suggest"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-integrations-page.tsx: the AI group\'s control lands in the facet namespace.')
