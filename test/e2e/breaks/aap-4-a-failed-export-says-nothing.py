# A FAILED EXPORT IS DROPPED AGAIN, as the `void` dropped it.
# Reddens: admin-audit-page: "an export that fails says so"
import io
p = '/home/user/rundesk/apps/web/src/pages/admin-audit-page.tsx'
a = "    ).catch(() => toast.error(t('adminAudit.exportFailed')))\n"
b = '    ).catch(() => {})\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("aap-4-a-failed-export-says-nothing: applied")
