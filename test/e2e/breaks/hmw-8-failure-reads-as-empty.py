# A FAILED READ SHOWS THE EMPTY STATE AGAIN, the confident zero.
# Reddens: home-my-work: "a read that failed says so, instead of “no tasks”"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
a = '              {myTasksQuery.isSuccess &&\n'
b = '              {!myTasksQuery.isPending &&\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hmw-8-failure-reads-as-empty: applied")
