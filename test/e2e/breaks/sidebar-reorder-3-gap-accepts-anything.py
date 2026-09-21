# The between-rows strip arms for ANYTHING in flight instead of for its own kind.
# The next drop then hands a container an id that is not one of its children, and
# the endpoint 400s on a gesture that looked armed and correct.
# Reddens: sidebar-reorder "a list over a project strip does not arm it"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "  const canDropAtGap = (gap: Pick<Gap, 'itemKind'>) => !!dragItem && dragItem.kind === gap.itemKind\n"
b = "  // BROKEN: any drag arms any strip.\n  const canDropAtGap = (_gap: Pick<Gap, 'itemKind'>) => !!dragItem\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: every reorder strip arms for every drag.')
