# Create Team closes its dialog and writes nothing: the facade, which looks
# identical from the screen for as long as nobody reloads.
# Reddens: teams-empty-state "the team it created is a team the API agrees
#   exists" (and the two checks after it, which read the list it never joined).
import io
p='/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s=io.open(p,encoding='utf-8').read()
a="""    mutationFn: (name: string) =>
      api<GroupRow>(`/workspaces/${workspaceId}/groups`, {
        method: 'POST',
        body: { name },
      }),
"""
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"    mutationFn: async (name: string) => ({ id: name, name }) as GroupRow,\n"))
