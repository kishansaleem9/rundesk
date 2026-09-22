# Outlook is dropped, leaving Google alone. Frame `12:40` offers two, and a check
# that only looked for Google would pass on this.
#
# IT RAN GREEN BECAUSE `hidden` LEAVES THE ELEMENT IN THE DOM. The check counted
# everything matching the provider prefix with `evaluateAll`, which sees attached
# elements whether or not anybody can press them — so a button hidden by an
# attribute was still one of "exactly the frame's two providers". A button nobody
# can press is not one of the two the frame offers, and the suite asks for
# `checkVisibility()` now. The patch is unchanged: hiding it is the more
# interesting mistake than deleting it, because the element, the handler and the
# testid all survive.
#
# Reddens: planner-onboarding: "exactly the frame's two providers, in its order"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '              data-testid="planner-onboarding-connect-outlook"\n'
b = '              data-testid="planner-onboarding-connect-outlook"\n              hidden\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: only one calendar provider is offered.')
