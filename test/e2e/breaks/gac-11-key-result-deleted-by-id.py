# A KEY RESULT IS DELETED BY ITS OWN ID, whatever goal the route names.
# Reddens: goal-access: "a user of another organisation can neither rename nor delete this workspace’s key result through a goal of their own (404 each), and it is unchanged — their own is renamed (200)"
import io
p = '/home/user/rundesk/apps/api/src/modules/goals/goals.service.ts'
a = '    const existing = await this.keyResultOf(goal.id, krId)\n    await this.db.delete(goalKeyResults).where(eq(goalKeyResults.id, existing.id))\n'
b = '    void goal\n    await this.db.delete(goalKeyResults).where(eq(goalKeyResults.id, krId))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gac-11-key-result-deleted-by-id: applied")
