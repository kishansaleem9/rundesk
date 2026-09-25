# THE TEMPLATES PAGE OFFERS SAVE AS TEMPLATE TO EVERYBODY, AS IT DID.
# Reddens: project-template-key: "the templates page offers Save as template to the member granted template.manage, and not to a plain member"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const mayManageTemplates = usePermissions(workspaceId ?? undefined).can('template.manage') === true\n"
b = "  const mayManageTemplates: boolean = usePermissions(workspaceId ?? undefined).can('template.manage') === true || true\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ptk-6-page-offers-everyone: the page offers everyone')
