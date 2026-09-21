# NARROWING A LIST THE BROWSER ALREADY HAS. The Locations section stops asking
# the server and reuses the sidebar's own `['spaces', workspaceId]` cache — the
# flat list of spaces — then filters it in the page. On this run's fixtures it
# still finds `Space <TAG>` and photographs as working, while every FOLDER and
# every LIST in the workspace has silently become unmentionable: the section
# says "no matches" for containers that exist and were simply never loaded.
# That is the confident zero this row exists to catch, and it leaves the page
# without a single request going out (the key is already warm from the sidebar).
# Reddens: task-mentions -- 'the narrowing went to the SERVER carrying types=space,folder,list and this runs own word'
import io

p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'

a = """  const mentionLocationsQuery = useQuery({
    queryKey: ['mention-locations', workspaceId, mentionQuery],
    queryFn: () =>
      api<Array<{ id: string; entityType: string; title: string; url: string }>>(
        `/search/${workspaceId}?q=${encodeURIComponent(mentionQuery)}&types=space,folder,list&limit=20`,
      ),
    enabled: !!workspaceId && mentionTab === 'locations',
  })"""
b = """  const mentionLocationsQuery = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () =>
      api<Array<{ id: string; name: string }>>(`/spaces/workspace/${workspaceId}`).then((rows) =>
        rows.map((r) => ({ id: r.id, entityType: 'space', title: r.name, url: '' })),
      ),
    enabled: !!workspaceId && mentionTab === 'locations',
  })"""

c = """  const locationMentionCandidates: MentionSimpleLite[] = (mentionLocationsQuery.data ?? []).map((l) => ({"""
d = """  const locationMentionCandidates: MentionSimpleLite[] = (mentionLocationsQuery.data ?? [])
    .filter((l) => (l.title ?? '').toLowerCase().includes(mentionQuery))
    .map((l) => ({"""

s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'query anchor appears {s.count(a)} times in {p}, expected exactly 1'
assert s.count(c) == 1, f'candidates anchor appears {s.count(c)} times in {p}, expected exactly 1'
s = s.replace(a, b).replace(c, d)
io.open(p, 'w', encoding='utf-8').write(s)
print("task-detail-sheet.tsx: Locations now filters the sidebar's cached space list instead of searching the server.")
