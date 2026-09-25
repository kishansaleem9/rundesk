# CLEARING THE DOCK STORES AN EMPTY ONE: there is no way back to the default tools.
# Reddens: dock-defaults: "a dock arranged to hold nothing holds nothing — and cleared, it has its default tools again"
import io
p = '/home/user/rundesk/apps/api/src/modules/dashboards/dashboards.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      set.pinnedLinks = patch.pinnedLinks === null ? null : Array.isArray(patch.pinnedLinks) ? patch.pinnedLinks.map(String) : []\n'
b = '      set.pinnedLinks = patch.pinnedLinks === null ? [] : Array.isArray(patch.pinnedLinks) ? patch.pinnedLinks.map(String) : []\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("dkd-2-clearing-empties-the-dock: clearing empties the dock")
