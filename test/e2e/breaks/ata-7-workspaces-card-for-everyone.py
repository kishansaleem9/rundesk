# THE ARCHIVED WORKSPACES CARD IS OFFERED TO EVERY READER OF THE TAB: a plain member is shown workspaces to restore.
# Reddens: archived-tasks-access: "on the member’s Archived tab the view-only space’s task is listed without Restore and marked view only, and no Archived workspaces card is offered to restore from"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      {isAdmin && (\n      <Card className="overflow-hidden">\n        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">\n          <Building2'
b = '      {(\n      <Card className="overflow-hidden">\n        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">\n          <Building2'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ata-7-workspaces-card-for-everyone: the Archived workspaces card for everyone')
