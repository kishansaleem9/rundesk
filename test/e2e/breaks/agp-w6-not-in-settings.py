# SETTINGS → AI USAGE DRAWS NO AGENT PERFORMANCE beside the credits it shows.
# (`found-14-oct/agent-performance-carried-and-unbuilt`)
# Reddens: agent-performance: "Settings → AI usage draws the same table under the credits card"
import io
c = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(c, encoding='utf-8').read()
old = '      <AgentPerformanceCard workspaceId={workspaceId} />\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-w6-not-in-settings: settings → ai usage draws no agent performance beside the credits it shows.')
