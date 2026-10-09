# ANYBODY SIGNED IN SEARCHES ANY WORKSPACE'S LIBRARY.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: cover-photo-search: "the library is searched for the workspace’s own members; a blank search, a page past fifty, and a photo the library does not hold are refused"
#
# WorkspaceMemberGuard stays imported, and unused, as the compile allows.
import io
p = '/home/user/rundesk/apps/api/src/modules/cover-photos/cover-photos.controller.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)\n',
     '@UseGuards(JwtAuthGuard) // BROKEN: no membership asked\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cph-5-anybody-searches: anybody searches')
