# The box loses the frame's sentence and becomes a generic Search, which says nothing about creating.
# Reddens: create-menu-ai: the create menu opens with the frame's own sentence over it
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = '  \'quickCreate.searchPlaceholder\': "Describe anything to create",\n'
b = '  \'quickCreate.searchPlaceholder\': "Search",\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("catalogs.ts: The box loses the frame's sentence and becomes a generic Search, which says nothing about creating.")
