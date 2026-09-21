# The drop rearranges the tree IN THE BROWSER and tells the server nothing: the
# reorder call is replaced with an optimistic write into the React Query cache.
# This is the exact facade the row exists to catch — it photographs correctly,
# it feels instant, and the arrangement is gone on the next page load.
# Reddens: sidebar-reorder "dropping it sends the new order to the server, in full"
#      and sidebar-reorder "and the server kept it — the stored positions are the new order"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "      await reorderSiblings(item.kind, gap, next)\n"
b = (
    "      // BROKEN: optimistic only — nothing is sent, the column just moves.\n"
    "      qc.setQueryData(['space-tree', workspaceId], (prev: any) => prev)\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the reorder drop writes nothing and redraws optimistically.')
