# PROGRESS IS THE CURRENT VALUE, NOT ITS SHARE OF THE TARGET: 30 of 60 reads 30%.
# A goal at 40 of 100 could not tell these apart, which is why the suite plants 30 of 60.
# Reddens: goals-page: "a goal at 30 of 60 reads 50% on its card"
import io
p = '/home/user/rundesk/apps/web/src/lib/goal-progress.ts'
a = '  return Math.max(0, Math.min(100, Math.round((currentValue / targetValue) * 100)))\n'
b = '  return Math.max(0, Math.min(100, Math.round(currentValue)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gp-2-progress-is-the-raw-value: applied")
