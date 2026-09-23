# THE ADMIN PAGE OFFERS TEN OF THE SERVER'S EVENTS.
# Reddens: webhook-access: "this page offers the same events, each by its name"
import io
p = '/home/user/rundesk/apps/web/src/pages/admin-webhooks-page.tsx'
a = '          {(eventCatalog.data ?? []).map((eventName) => {\n'
b = '          {(eventCatalog.data ?? []).slice(0, 10).map((eventName) => {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-18-admin-offers-ten: applied")
