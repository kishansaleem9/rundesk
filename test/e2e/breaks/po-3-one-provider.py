# Outlook is dropped, leaving Google alone. Frame `12:40` offers two, and a check
# that only looked for Google would pass on this.
# Reddens: planner-onboarding: "exactly the frame's two providers, in its order"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '              data-testid="planner-onboarding-connect-outlook"\n'
b = '              data-testid="planner-onboarding-connect-outlook"\n              hidden\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: only one calendar provider is offered.')
