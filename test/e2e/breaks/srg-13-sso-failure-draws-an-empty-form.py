# AN SSO READ THAT FAILS DRAWS THE EMPTY FORMS, ready to be saved over what is there.
# Reddens: settings-role-grants: "the SSO holder saves an OIDC connection from Settings — it is saved, after a reload the form shows what was saved, and when it cannot be read the tab says so instead of an empty form"
import io
p = '/home/user/rundesk/apps/web/src/components/sso-tab.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      ) : connectionsQ.isError ? (\n'
b = "      ) : connectionsQ.isError && workspaceId === '' ? (\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-13-sso-failure-draws-an-empty-form: a failed SSO read draws the forms')
