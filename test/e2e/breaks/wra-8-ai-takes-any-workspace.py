# THE AI ROUTES TAKE ANY WORKSPACE AGAIN: the guard is gone, and a stranger's prompt is built from it.
# Re-aimed 25 September: the account-role guest guard beside it was retired (`guest-guard-reads-the-account-role`); the anchor is the line without it.
# Reddens: workspace-read-access: "a user outside the workspace is refused AI chat and AI command on it, before any model is asked — while a member is not"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = '@UseGuards(JwtAuthGuard, NamedWorkspaceMemberGuard, PlanFeatureGuard)\n'
b = '@UseGuards(JwtAuthGuard, PlanFeatureGuard)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-8-ai-takes-any-workspace: applied")
