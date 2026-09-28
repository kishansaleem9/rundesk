# WHICH CLICKAPPS ARE ON IS READ FOR THE VIEWED WORKSPACE ONLY BY THE SWITCH'S HOLDERS: a member and a manager read their own workspace's flags instead.
# Reddens: clickapp-flags-access: "a plain member and the manager still read which ClickApps are on (200): Goals, switched off by the admin, reads off for them, and Docs stays on"
#   or "a plain member’s pages learn which ClickApps are on from /feature-flags/resolved (200, Goals off) and never ask for the override list or meet a refusal"
import io
p = '/home/user/rundesk/apps/api/src/modules/feature-flags/feature-flags.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '        const [member] = await this.db\n          .select({ userId: workspaceMembers.userId })\n          .from(workspaceMembers)\n          .where(and(eq(workspaceMembers.workspaceId, requestedWorkspaceId), eq(workspaceMembers.userId, user.id)))\n          .limit(1)\n        if (member) workspaceId = requestedWorkspaceId\n'
b = '        if (await this.customRoles.hasPermission(requestedWorkspaceId, user.id, CLICKAPPS_KEY)) workspaceId = requestedWorkspaceId\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cka-9-explicit-workspace-for-holders-only: resolved honours ?workspaceId for key holders only')
