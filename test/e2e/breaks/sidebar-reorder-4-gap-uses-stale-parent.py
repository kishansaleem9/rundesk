# The exact defect `canDropOn` is written out at length for, reintroduced one
# gesture over: the strip also asks "is this item ALREADY one of my siblings",
# answered from tree data that is a refetch behind every move. The drop is then
# refused in the browser and NO REQUEST IS EVER SENT — which from the database
# alone is indistinguishable from an endpoint that ignored the body.
# Reddens: sidebar-reorder "a folder's strip arms for a project that is not in that folder yet"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "  const canDropAtGap = (gap: Pick<Gap, 'itemKind'>) => !!dragItem && dragItem.kind === gap.itemKind\n"
b = (
    "  // BROKEN: asks where the client believes the item lives, which is stale.\n"
    "  const canDropAtGap = (gap: Pick<Gap, 'itemKind'> & { siblingIds?: string[] }) =>\n"
    "    !!dragItem && dragItem.kind === gap.itemKind && (gap.siblingIds ?? []).includes(dragItem.id)\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the strip refuses anything the tree does not already list under it.')
