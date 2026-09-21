# Take the explanation away and leave the disabled button. The refusal is still
# correct and still invisible — the dead end this row was built to avoid.
# Reddens: space-create-menu: "a Space with no Lists says so instead of leaving a disabled button unexplained"
import io
p = "/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx"
a = "  const noListsHere = !!spaceId && !listsQuery.isPending && lists.length === 0"
b = "  const noListsHere = false"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: a space with no lists is refused in silence again.')
