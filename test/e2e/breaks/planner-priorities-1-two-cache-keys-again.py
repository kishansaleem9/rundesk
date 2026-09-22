# The person panel reads the priorities endpoint under its own React Query key
# again, instead of the shared one.
#
# This is the state `lib/use-priorities` was written to end, and the panel's own
# comment says so: "They used to keep separate keys for the same endpoint, which
# meant adding a priority in one place left the other showing a stale list."
#
# IT IS AIMED AT A UNIT TEST, AND THAT IS A CORRECTION. This patch was written
# against a browser check in `planner-priorities.mjs` — open the panel in the
# same page after writing in the rail — and it ran GREEN. The reason is the
# panel's LIFECYCLE, not its key: the panel mounts when it opens, which is after
# the write, and a `useQuery` whose key holds no data fetches on mount. With
# React Query's default `staleTime: 0` even a populated key refetches on
# remount. There is no moment at which that screen can show a stale panel,
# because the panel does not exist until after the thing that would have made it
# stale.
#
# So the shared key is not observable from a browser here at all, and the check
# that claimed it was repeating a reason rather than testing one. The key is a
# fact about SOURCE, and it is pinned in `apps/web/src/lib/use-priorities.test.ts`
# — which this patch takes to three named failures:
#
#   - the person panel should read the list through usePriorities()
#   - the person panel declares its own priorities queryKey — that is the
#     two-key bug returning
#   - the person panel fetches the priorities endpoint itself instead of using
#     the hook
#
# Verified by applying it and running `pnpm --filter @rundesk/web test`, not by
# the break lane, which runs one e2e suite and would report this patch as
# still-green forever.
#
# It is a plausible edit because the panel is the surface that WANTS a
# per-person key — it can show a colleague's list — and `useQuery` inline is
# six lines that read as more explicit than a hook from another file.
#
# Reddens: unit: use-priorities.test.ts "the person panel declares its own priorities queryKey — that is the two-key bug returning"
import io
p = '/home/user/rundesk/apps/web/src/components/person-panel.tsx'
a = "  const query = usePriorities(workspaceId, userId)"
b = """  const query = useQuery({
    queryKey: ['person-priorities', workspaceId, userId],
    enabled: !!workspaceId && !!userId,
    queryFn: () => api<{ id: string; taskId: string | null; title: string; position: number; doneAt: string | null }[]>(
      `/workspaces/${workspaceId}/people/${userId}/priorities`,
    ),
  })"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('person-panel.tsx: the panel caches priorities under its own key again.')
