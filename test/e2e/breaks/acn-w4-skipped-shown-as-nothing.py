# A SKIPPED RUN IS SHOWN WITHOUT SAYING IT WAS SKIPPED.
# (`found-14-oct/automation-conditions-and-actions-unbuilt`)
# Reddens: automation-conditions: "and its run history shows the skipped run, and how many conditions did not hold"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-automations-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                  {run.outcome === \'skipped\' ? (\n                    <span className="text-muted-foreground truncate" data-testid="automation-run-skipped">',
     '                  {run.outcome === \'never\' ? (\n                    <span className="text-muted-foreground truncate" data-testid="automation-run-skipped">'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acn-w4-skipped-shown-as-nothing: A SKIPPED RUN IS SHOWN WITHOUT SAYING IT WAS SKIPPED.')
