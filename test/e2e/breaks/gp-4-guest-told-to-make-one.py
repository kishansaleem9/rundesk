# THE GUEST'S EMPTY PAGE TELLS THEM TO MAKE A GOAL, not that none is shared with them.
# Reddens: goals-page: "a guest is offered no “New goal” and is told no goal is shared with them — a member is offered one"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-goals-page.tsx'
a = "                {t(isGuest ? 'goals.emptyGuest' : 'goals.emptyDesc')}\n"
b = "                {t('goals.emptyDesc')}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gp-4-guest-told-to-make-one: applied")
