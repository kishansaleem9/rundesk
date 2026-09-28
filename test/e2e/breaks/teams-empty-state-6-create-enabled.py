# Create Team is enabled for everybody, including the members the API refuses —
# a button whose only outcome is a 403.
# Reddens: teams-empty-state: "and the page offers them a disabled button with a reason, not a 403"
import io
p='/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s=io.open(p,encoding='utf-8').read()
a="""                      data-testid="teams-empty-create"
                      disabled={!mayCreateTeam}
"""
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"""                      data-testid="teams-empty-create"
                      disabled={false}
"""))
