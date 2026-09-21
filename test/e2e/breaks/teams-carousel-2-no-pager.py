# Three cards in a grid and no pager — the count right, the mechanism absent.
# Reddens: teams-empty-state: "and the pager the frame centres beneath them"
import io
p = "/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx"
a = '                      data-testid="teams-empty-pager-prev"\n'
b = '                      data-testid="teams-empty-pager-prev-x"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-teams-page.tsx: the previous arrow is no longer findable.')
