# INSIGHTS' "CAN MANAGE" IS FALSE FOR EVERYBODY, as the empty store made it.
# Reddens: workspace-role-controls: "Insights offers its admin “Download PDF”, and a member, on the same section, none"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-insights-page.tsx'
a = '  const { isManagerOrAbove: canManage } = useWorkspaceRole(workspaceId)\n'
b = '  const canManage = false as boolean\n  void useWorkspaceRole\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wrc-1-insights-manages-for-nobody: applied")
