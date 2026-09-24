# A TRAIL THAT FAILS TO LOAD SAYS "NO AUDIT EVENTS YET." AGAIN.
# Reddens: admin-audit-page: "a trail that fails to load says so — and not that there are no events"
import io
p = '/home/user/rundesk/apps/web/src/pages/admin-audit-page.tsx'
a = '        {logsQuery.isError && (\n          <Card className="p-8 text-center text-muted-foreground">\n            <p data-testid="admin-audit-load-failed">{t(\'adminAudit.loadFailed\')}</p>\n          </Card>\n        )}\n        {!logsQuery.isLoading && !logsQuery.isError && logs.length === 0 && (\n'
b = '        {!logsQuery.isLoading && logs.length === 0 && (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("aap-5-a-failed-read-is-an-empty-one: applied")
