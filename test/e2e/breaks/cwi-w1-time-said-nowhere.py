# THE REPORT DOES NOT SAY THE TIME THE RUN BROUGHT.
# (`found-14-oct/clickup-docs-time-goals-unimported`)
# Reddens: clickup-workspace-import: "the run brings the rest of the Workspace and says so: four pages of Docs, one time entry made and one held for somebody invited, two Goals"
import io
p = '/home/user/rundesk/apps/web/src/pages/import-apps.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        {result.timeEntriesImported !== undefined && <Figure testid="import-app-r-time" label={t(\'import.appTime\')} value={result.timeEntriesImported} />}\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-w1-time-said-nowhere: THE REPORT DOES NOT SAY THE TIME THE RUN BROUGHT.')
