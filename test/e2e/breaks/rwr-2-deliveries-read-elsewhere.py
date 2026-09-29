# THE DELIVERIES PANEL ASKS A ROUTE THAT IS NOT THERE.
# Reddens: routes-with-readers: "a webhook’s Deliveries lists its recent deliveries — the failed test delivery among them, marked failed, with its event"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    queryFn: () => api<Delivery[]>(`/workspaces/${workspaceId}/webhooks/${webhookId}/deliveries`),\n'
b = '    queryFn: () => api<Delivery[]>(`/workspaces/${workspaceId}/webhooks/${webhookId}/delivery-log`),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rwr-2-deliveries-read-elsewhere: the panel reads nothing')
