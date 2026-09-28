# THE ROUTE AWAITS THE PERMISSION READ AND THROWS ITS REDIRECT AFTER, as it did: a slow read blanks the page.
# Reddens: member-settings-tabs: "with the permission read held back 4.5 s, a plain member opening Settings lands on Archived with their three tabs every time, three of three, and nothing throws — the page does not go blank"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.settings.tsx'
s = io.open(p, encoding='utf-8').read()
pairs = [
  ("  beforeLoad: ({ params, search, context }) => {\n", "  beforeLoad: async ({ params, search, context }) => {\n"),
  ("    const held = context.queryClient.getQueryData<{ permissions: string[] }>(permissionsQuery(workspaceId).queryKey)\n    if (!held) {\n      void context.queryClient.prefetchQuery(permissionsQuery(workspaceId)).catch(() => undefined)\n      return\n    }\n",
   "    const held = await context.queryClient.ensureQueryData(permissionsQuery(workspaceId)).catch(() => null)\n    if (!held) return\n"),
]
for a, b in pairs:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('sbs-1-route-awaits-the-read: the route waits for the read again')
