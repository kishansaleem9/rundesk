# TODAY & OVERDUE TAKES EVERYTHING WITH A DATE, next week included.
# Reddens: home-my-work: "“Today & overdue” lists what is due by today and still open, and counts it"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
a = '    return isToday(due) || isPast(due)\n'
b = '    return !Number.isNaN(due.getTime())\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hmw-7-everything-dated-is-due: applied")
