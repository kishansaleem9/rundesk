# THE CUT IS NOT NOTICED: 501 answered, 500 shown, and counted a confident 500.
# Reddens: home-my-work: "a list that ran to the limit is counted “500+”, not a confident 500"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
a = '  const myTasksCut = (myTasksQuery.data?.length ?? 0) > HOME_TASKS_SHOWN\n'
b = '  const myTasksCut = (myTasksQuery.data?.length ?? 0) > HOME_TASKS_SHOWN * 2\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hmw-9-count-is-confident: applied")
