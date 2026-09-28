# A MEMBER LANDS ON WHICHEVER OPEN TAB THE RAIL DRAWS FIRST — Features, not Archived.
# Reddens: settings-tabs-by-key: "a plain member, who holds none of these keys, opens Settings on Archived, with only Trash and Features beside it — no tab a key opens"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (tabs.includes('general')) return 'general'\n  return tabs.find((tab) => !OPEN_TABS.includes(tab)) ?? OPEN_TABS.find((tab) => tabs.includes(tab)) ?? 'general'\n"
b = "  if (tabs.includes('general')) return 'general'\n  return tabs[0] ?? 'general'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mst-7-land-on-the-first-tab: done')
