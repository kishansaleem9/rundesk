# THE FIRST PAGE IS ALL THERE IS: nothing ever says there is another.
# Reddens: inbox-scope: "the first page is fifty rows, with "Load older" under them"
import io
p = '/home/user/rundesk/apps/web/src/lib/notifications-query.ts'
a = '    getNextPageParam: (last) => (last.length > pageSize ? last[pageSize - 1].id : undefined),\n'
b = '    getNextPageParam: () => undefined,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-18-no-next-page: applied")
