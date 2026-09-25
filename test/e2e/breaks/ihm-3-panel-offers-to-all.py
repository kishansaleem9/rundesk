# THE EMAIL PANEL OFFERS A NEW WEBHOOK TO EVERY READER.
# Reddens: inbound-hook-makers: "the Email panel offers a new webhook only where the reader may add: not in the view-only list, not in the Edit one, and in the Full edit one"
import io
p = '/home/user/rundesk/apps/web/src/components/list-email-alias-panel.tsx'
a = '  const mayCreateWebhook = mayAddTasks\n'
b = '  const mayCreateWebhook = true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ihm-3-panel-offers-to-all: applied')
