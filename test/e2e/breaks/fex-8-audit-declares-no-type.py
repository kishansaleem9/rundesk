# THE AUDIT EXPORT STOPS DECLARING ITS CONTENT TYPE: its CSV is wrapped and served as JSON.
# Reddens: file-exports: "Audit log → Export CSV saves a .csv whose first row is the header"
import io
p = '/home/user/rundesk/apps/api/src/modules/security/security.controller.ts'
a = "  @Get('export')\n  @Header('Content-Type', 'text/csv; charset=utf-8')\n"
b = "  @Get('export')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fex-8-audit-declares-no-type: applied")
