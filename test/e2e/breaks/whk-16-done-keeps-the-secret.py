# "I HAVE COPIED IT" THAT KEEPS IT ON SCREEN.
# Reddens: webhook-access: "once dismissed it is gone — from the page, and from the list it reads after a reload"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = '<WebhookSecretOnce name={madeSecret.name} secret={madeSecret.secret} onDone={() => setMadeSecret(null)} />'
b = '<WebhookSecretOnce name={madeSecret.name} secret={madeSecret.secret} onDone={() => undefined} />'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-16-done-keeps-the-secret: applied")
