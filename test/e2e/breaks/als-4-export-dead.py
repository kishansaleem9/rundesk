# THE PANEL'S EXPORT CSV DOES NOTHING.
# Reddens: audit-log-settings: "its Export CSV downloads the workspace’s trail (200)"
import io
p = '/home/user/rundesk/apps/web/src/pages/admin-audit-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>\n'
b = '        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => undefined}>\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('als-4-export-dead: Export CSV does nothing')
