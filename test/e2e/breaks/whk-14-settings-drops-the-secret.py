# THE SETTINGS FORM THROWS AWAY THE ONE ANSWER THAT CARRIES THE SECRET, as it did.
# Reddens: webhook-access: "a webhook made on the page shows its signing secret — the one stored — and joins the list"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = '      setMadeSecret(made?.secret ? { name: made.name, secret: made.secret } : null)\n    },\n'
b = '      setMadeSecret(null)\n    },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-14-settings-drops-the-secret: applied")
