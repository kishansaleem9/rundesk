# A GUEST READS GOALS AS A MEMBER DOES.
# Reddens: goal-access: "a guest lists no goals and opens none (200 with none; 404) — the member opens the same goal (200)"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/read-access.ts'
a = "  if (!role || role === 'guest') return 'none'\n"
b = "  if (!role) return 'none'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gac-9-guests-read-as-members: applied")
