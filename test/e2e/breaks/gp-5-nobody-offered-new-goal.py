# NOBODY IS OFFERED "NEW GOAL": the guest's rule taken for everyone. The member's twin reddens.
# Reddens: goals-page: "a guest is offered no “New goal” and is told no goal is shared with them — a member is offered one"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-goals-page.tsx'
a = "  const isGuest = role === 'guest'\n"
b = '  const isGuest = true as boolean\n  void role\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gp-5-nobody-offered-new-goal: applied")
