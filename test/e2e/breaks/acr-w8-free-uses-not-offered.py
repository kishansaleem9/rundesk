# A FEATURE WITH FREE USES LEFT IS LOCKED.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "the Team View says how many of its free uses are left"
#
# The paywall opens from the first use.
import io
p = '/home/user/rundesk/apps/web/src/components/feature-gate.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    return !!free && free.left > 0",
     "    return !!free && free.left > 100"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-w8-free-uses-not-offered: A FEATURE WITH FREE USES LEFT IS LOCKED.')
