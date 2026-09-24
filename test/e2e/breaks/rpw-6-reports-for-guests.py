# REPORTS IS OFFERED TO A GUEST AGAIN, in the sidebar and on the rail, and every
# request on the page is a 403.
# Reddens: role-permissions-web: "a guest is offered neither Space nor Project, nor Reports"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "                {featureEnabled(FLAGS.REPORTING) && permissions.can('report.view.basic') === true && (\n"
b = '                {featureEnabled(FLAGS.REPORTING) && (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = '    (entry) => (!entry.flag || featureEnabled(entry.flag)) && (entry.path !== `${base}/reports` || mayViewReports),\n'
b = '    (entry) => (!entry.flag || featureEnabled(entry.flag)) && (entry.path !== `${base}/reports` || mayViewReports || true),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rpw-6-reports-for-guests: Reports is offered to a guest')
