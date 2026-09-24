# THE CARD DRAWS `goal.progress` AGAIN, the field the API has never sent: every card 0%.
# Reddens: goals-page: "a goal at 30 of 60 reads 50% on its card"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-goals-page.tsx'
a = '                {goalProgress(goal.currentValue, goal.targetValue)}%\n'
b = '                {Math.round(Number((goal as { progress?: number }).progress ?? 0))}%\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gp-1-card-reads-a-field-never-sent: applied")
