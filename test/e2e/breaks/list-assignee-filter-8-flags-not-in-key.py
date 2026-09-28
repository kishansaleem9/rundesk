# THE CACHE PATCH. The three flags leave the React Query key, so the second
# combination is answered out of the first one's cache for thirty seconds:
# the switches appear to work once and then stop, which is the worst shape
# a bug can have. `query.ts` sets staleTime: 30_000.
# Reddens: "each combination went out on its own, so none of them was answered from a warm cache" and the grid checks after
#          the first switch.
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      assignedViaPerson,\n      assignedViaComments,\n      assignedViaSubtasks,\n      assignedViaChecklists,\n    ],'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '      assignedViaPerson,\n    ],'))
print('[break 8] Every combination shares one cache key.')
