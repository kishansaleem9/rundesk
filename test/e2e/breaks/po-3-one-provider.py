# Outlook is dropped, leaving Google alone. Frame `12:40` offers two, and a check
# that only looked for Google would pass on this.
#
# IT RAN GREEN TWICE, FOR TWO DIFFERENT REASONS, and the second one was in the
# patch rather than in the check.
#
# FIRST: the check counted everything matching the provider prefix with
# `evaluateAll`, which sees attached elements whether or not anybody can press
# them. The suite asks for `checkVisibility()` now, which is right and is not
# what was wrong here.
#
# SECOND: the `hidden` ATTRIBUTE DOES NOTHING TO THIS BUTTON. `[hidden]` sets
# `display: none` from the user-agent stylesheet, and `buttonVariants` puts
# `inline-flex` on the element through a CLASS — which wins. So the button stayed
# visible, `checkVisibility()` correctly said so, and the check correctly passed:
# both providers really were still being offered. A patch that photographs as
# hiding something and hides nothing is the facade defect, in the tool built to
# find facades.
#
# An inline `style` cannot be overridden by a class, so this is the one form of
# "hidden but still attached" that survives Tailwind. The element, the handler
# and the testid all still exist, which is the mistake worth modelling — a
# provider nobody can press, rather than a provider nobody wrote.
#
# Reddens: planner-onboarding: "exactly the frame's two providers, in its order"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '              data-testid="planner-onboarding-connect-outlook"\n'
b = '              data-testid="planner-onboarding-connect-outlook"\n              style={{ display: \'none\' }}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: only one calendar provider can be pressed.')
