# A MEMBER SETS THE BENCHMARK: only membership is asked, not a workspace admin's role.
# (`found-14-oct/agent-performance-carried-and-unbuilt`) The number is shown to the whole workspace.
# Reddens: agent-performance: "a member is refused setting the benchmark in words, and it stays as it was (read by SQL)"
import io
c = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(c, encoding='utf-8').read()
old = "      if (!isManagerRole(member.role as string)) {\n        throw new ForbiddenException('Only a workspace admin can change the AI benchmark')\n      }\n"
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-14-a-member-sets-the-benchmark: a member sets the benchmark')
