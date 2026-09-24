# THE GUARD LOOKS A STRANGER UP AND LETS THEM THROUGH anyway: the lookup without the refusal.
# Reddens: workspace-read-access: "a user outside the workspace is refused AI chat and AI command on it, before any model is asked — while a member is not"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/named-workspace-member.guard.ts'
a = "    if (!member) throw new NotFoundException('Workspace not found')\n"
b = '    if (!member) return true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-9-guard-waves-strangers-in: applied")
