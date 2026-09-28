# The panel takes the whole surface, hiding a calendar that works without any
# external account — a feature removed in order to advertise another. This is
# the recorded decision, so it needs a patch holding it.
# Reddens: planner-onboarding: "the panel sits above the grid (panel ends at y="
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "        {view === 'month' ? (\n          <MonthGrid\n"
b = "        {showOnboarding ? null : view === 'month' ? (\n          <MonthGrid\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the onboarding panel now hides the grid.')
