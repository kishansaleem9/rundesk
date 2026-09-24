# A CREATE THAT FAILS SAYS NOTHING AGAIN: the mutation loses its onError.
# Reddens: goals-page: "a goal the server will not make says so"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-goals-page.tsx'
a = "    onError: () => toast.error(t('goals.createFailed')),\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gp-6-create-fails-without-a-word: applied")
