# A WEBHOOK'S ROW OFFERS NO DELIVERIES AGAIN.
# Reddens: routes-with-readers: "a webhook’s Deliveries lists its recent deliveries — the failed test delivery among them, marked failed, with its event"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '          {deliveriesOf && hooks.some((h) => h.id === deliveriesOf) && (\n'
b = '          {Boolean(0) && deliveriesOf && hooks.some((h) => h.id === deliveriesOf) && (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rwr-1-no-deliveries-toggle: the deliveries are never drawn')
