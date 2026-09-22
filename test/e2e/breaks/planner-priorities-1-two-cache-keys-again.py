# The person panel reads the priorities endpoint under its own React Query key
# again, instead of the shared one.
#
# This is the state `lib/use-priorities` was written to end, and the panel's own
# comment says so: "They used to keep separate keys for the same endpoint, which
# meant adding a priority in one place left the other showing a stale list."
# The rail's write invalidates `['priorities', ws, user]`; nothing invalidates
# `['person-priorities', ws, user]`, so the panel serves whatever it cached.
#
# THIS PATCH COULD NOT HAVE BEEN CAUGHT A DAY AGO. The check that covers it
# carried a comment claiming it read "the person panel's own query through the
# app", and the code called the API directly with `A(...)` — which goes nowhere
# near a cache and asserts only that two ENDPOINTS agree about a row. Under
# this patch the server is entirely correct and every direct read returns the
# priority. It fails in exactly one place: the panel, opened in the same page
# with no reload, which is what that check does now.
#
# It is a plausible edit because the panel is the surface that WANTS a
# per-person key — it can show a colleague's list — and `useQuery` inline is
# four lines that read as more explicit than a hook from another file.
#
# The rail is untouched, so "the rail shows it without a reload" stays green.
# That is the pair the new check exists to complete: one surface right, the
# other stale, which is precisely the bug and precisely what a single-surface
# suite cannot see.
#
# Reddens: planner-priorities: "and the person panel shows it without a reload — one cache entry, not two"
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
