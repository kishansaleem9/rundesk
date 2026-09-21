# Gmail needs no credential, so the tab never says it is not connected and the
# empty list is all a person gets.
# Reddens: app-catalogue: "and choosing it says it is not connected instead of
#          drawing an empty result"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/sources.ts'
a = """  'google-drive': 'google-drive',
  gmail: 'gmail',
"""
b = """  'google-drive': 'google-drive',
  gmail: null,
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sources.ts: Gmail claims to need no credential, so it is always "connected".')
