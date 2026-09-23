# THE PANEL SHOWS ONLY THE HOOKS WHOSE ADDRESS IT HAS: somebody else's is not there at all.
# Reddens: hook-portal-access: "in the member’s panel the admin’s hook is listed by name, with no address and no delete — and their own shows its address"
import io
p = '/home/user/rundesk/apps/web/src/components/list-email-alias-panel.tsx'
a = '            webhooks.map((w) =>\n              w.token ? (\n'
b = '            webhooks.filter((w) => w.token).map((w) =>\n              w.token ? (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hpa-13-panel-drops-tokenless-hooks: applied")
