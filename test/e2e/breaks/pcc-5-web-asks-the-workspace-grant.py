# THE PLANNER'S CONNECT POSTS THE WORKSPACE'S `oauth/start` AGAIN: a member is refused.
# Reddens: personal-calendar-connect: "the member’s \"Add account\" takes them to Google with their own grant, and one that failed is said on the Accounts page until it is closed"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-calendar-connect.ts'
s = io.open(p, encoding='utf-8').read()
a = "      api<{ authUrl: string }>(`/workspaces/${workspaceId}/calendar-sync/connect/${provider}`, { method: 'POST' }),\n"
b = "      api<{ authUrl: string }>(`/workspaces/${workspaceId}/integrations/connections/${provider}/oauth/start`, { method: 'POST' }),\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pcc-5-web-asks-the-workspace-grant: the web asks the workspace grant')
