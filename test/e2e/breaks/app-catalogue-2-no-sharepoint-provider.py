# SharePoint loses its own provider row, which is how it came to borrow
# OneDrive's in the first place.
# Reddens: app-catalogue: "and so is SharePoint, in its own right rather than
#          through OneDrive"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
a = """      'onedrive',
      'sharepoint',
      'linear',
"""
b = """      'onedrive',
      'linear',
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('integration-connections.service.ts: sharepoint is no longer a connectable provider.')
