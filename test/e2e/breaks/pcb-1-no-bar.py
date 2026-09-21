# The bar is removed, which is the state the ledger recorded.
# Reddens: planner-command-bar: "the planner carries exactly one command bar"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '            data-testid="planner-command-bar"\n'
b = '            data-testid="planner-command-bar-removed"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the planner has no command bar.')
