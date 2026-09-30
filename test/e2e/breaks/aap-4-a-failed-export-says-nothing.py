# A FAILED EXPORT IS DROPPED AGAIN, as the `void` dropped it.
# Re-anchored 30 September (`found-30-sep/download-refusals-say-no-reason`): the catch shows the refusal's own
# words where the server wrote them for the reader (`refusalMessage`), and the page's otherwise.
# Reddens: admin-audit-page: "an export that fails says so"
import io
p = '/home/user/rundesk/apps/web/src/pages/admin-audit-page.tsx'
a = "    ).catch((e) => toast.error(refusalMessage(e, t('adminAudit.exportFailed'))))\n"
b = '    ).catch(() => {})\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("aap-4-a-failed-export-says-nothing: applied")
