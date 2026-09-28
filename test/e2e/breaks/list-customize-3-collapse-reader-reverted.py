# And for "Collapse empty columns": the preference is live, the lanes ignore it.
# Reddens: list-customize: "as well. So a collapsed * lane and an open one have the SAME bounding box, and a height comparison * on the column would report the collapse as broken on a build where it * works. The thing that actually goes away is the cards area, and it is * measured while it is there so that \"it is gone\" is not satisfied by its * never having been drawn. */ const openBodyHeight = (await lane(emptyLane).getByTestId('board-column-body').boundingBox().catch(() => null))?.height ?? 0 await flip('list-board-collapse-empty') chk( await lane(emptyLane).getAttribute('data-collapsed') === 'true', 'switching it on folds the empty lane',"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                    collapsedColumns.has(s.key) !==\n                    (collapseEmptyColumns && (tasksByStatus[s.key] ?? []).length === 0)'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '                    collapsedColumns.has(s.key)'))
print('[break 3] Collapse empty columns changes nothing on the board.')
