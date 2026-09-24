# THE SETTINGS PAGE OFFERS A LOGO ADDRESS BOX AGAIN, inviting what the save refuses.
# Reddens: settings-writes: "the settings page offers the logo as an upload, with no address box for what the save refuses"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = '        <div className="flex items-center gap-2" data-testid="settings-logo">\n'
b = '        <div className="flex items-center gap-2" data-testid="settings-logo">\n          <Input id="logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" />\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("stw-6-the-logo-address-box-returns: applied")
