# THE APP CENTER'S SWITCH IS LIVE FOR EVERYONE AGAIN, and the connect route refuses
# whoever lacks the key.
# Reddens: settings-role-grants: "the App Center offers the plain member no live switch for Slack — it says who connects apps, and offers to ask — while the holder’s switch is live, with Connect"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              disabled={isLoading || !supported || !providerReady || mayConnect !== true}\n'
b = '              disabled={isLoading || !supported || !providerReady}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-16-switch-live-for-everyone: the switch is live for everyone')
