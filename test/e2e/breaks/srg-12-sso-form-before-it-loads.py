# THE SSO FORMS ARE DRAWN BEFORE WHAT IS SAVED HAS LOADED, and never seeded again: after
# a reload a saved connection shows as an empty form under Update.
# Reddens: settings-role-grants: "the SSO holder saves an OIDC connection from Settings — it is saved, after a reload the form shows what was saved, and when it cannot be read the tab says so instead of an empty form"
import io
p = '/home/user/rundesk/apps/web/src/components/sso-tab.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      {connectionsQ.isLoading ? (\n'
b = "      {connectionsQ.isLoading && workspaceId === '' ? (\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = "            key={oidc?.id ?? 'new'}\n"
b = '            key="oidc"\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-12-sso-form-before-it-loads: the SSO forms are drawn before they load')
