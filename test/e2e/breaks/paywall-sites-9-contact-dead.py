# "Contact your admin" becomes a dead control: pressed, it says nothing back.
# Reddens: paywall-sites: "and \"Contact your admin\" answers instead of doing nothing"
import io
p = '/home/user/rundesk/apps/web/src/components/feature-gate.tsx'
s = io.open(p, encoding='utf-8').read()
a = "      setResult({ status: res?.status ?? 'failed', notified: res?.notified ?? 0 })"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "      void res"))
print('[break 9] stopped the gate recording the outcome of the ask in feature-gate.tsx —')
print('          the Contact your admin button now reports nothing.')
