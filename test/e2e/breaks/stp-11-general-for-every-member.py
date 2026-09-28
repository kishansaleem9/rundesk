# GENERAL OPENS TO A KEY EVERY MEMBER HOLDS: a plain member is shown General.
# Re-aimed 28 September: Settings opens to every member on Archived, so the check reads which tabs a plain member is shown.
# Reddens: settings-tabs-by-key: "a plain member, who holds none of these keys, opens Settings on Archived, with only Trash and Features beside it — no tab a key opens"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  general: ['workspace.manage'],\n"
b = "  general: ['workspace.manage', 'report.view.basic'],\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('stp-11-general-for-every-member: General opens to report.view.basic')
