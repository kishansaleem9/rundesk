# The gate is nailed shut, which is the state the ledger recorded: no onboarding
# screen at all.
# Reddens: planner-onboarding: "a person with no calendar connected gets the onboarding panel"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '  const showOnboarding =\n    settings !== undefined &&\n'
b = '  const showOnboarding =\n    false &&\n    settings !== undefined &&\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the onboarding panel never shows.')
