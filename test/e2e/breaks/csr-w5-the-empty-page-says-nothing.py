# WITH NO SYNC, THE PAGE SAYS NOTHING.
# (`ledger-rows/row-1962`)
# Reddens: calendar-sync-rules: "nothing syncs until a sync is added: a dated task’s push writes to no calendar — not the member’s own, which no sync names, nor the workspace’s connected Google Calendar — and the Automations page says to pick a list, folder, or space, offering + Add sync"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-sync-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('              <p className="text-sm text-muted-foreground">{t(\'plannerSync.empty\')}</p>\n',
     '              <p className="text-sm text-muted-foreground">{\'\'}</p>\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csr-w5-the-empty-page-says-nothing: the empty page says nothing')
