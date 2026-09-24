# A KEY RESULT IS FOUND BY ITS OWN ID, whatever goal the route names, as it was.
# Reddens: goal-access: "a key result is reached only through its own goal: the private goal’s, named through the open goal, is neither renamed nor deleted (404 each) — the open goal’s own is renamed (200)"
import io
p = '/home/user/rundesk/apps/api/src/modules/goals/goals.service.ts'
a = '      .where(and(eq(goalKeyResults.id, krId), eq(goalKeyResults.goalId, goalId)))\n'
b = '      .where(eq(goalKeyResults.id, krId))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gac-7-key-result-by-id-alone: applied")
