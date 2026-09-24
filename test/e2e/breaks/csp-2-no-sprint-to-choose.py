# THE SPRINT PERIOD OFFERS NO SPRINT TO CHOOSE AGAIN.
# Reddens: contribution-sprint: "the Sprint period offers a sprint to choose — the one begun last by default — and reports on the one chosen"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-insights-page.tsx'
a = "            {contribPeriod === 'sprint' && sprintChoices.length > 0 && (\n"
b = "            {contribPeriod === 'sprint' && sprintChoices.length < 0 && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("csp-2-no-sprint-to-choose: applied")
