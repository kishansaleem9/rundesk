# The list hides a private view and fetching it by id returns it anyway. The
# strip looks right, so the defect is invisible from the UI and reachable by
# anyone who has ever seen a link — the facade with the hole behind it.
#
# Reddens: view-visibility: "nor can they fetch it by id — 404, not 403"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = """    if (row.visibility === 'private' && !mine && actor.role !== 'super_admin') {
      // 404, not 403: "you may not see this" tells you it is there.
      throw new NotFoundException('View not found')
    }
"""
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('views.service.ts: a private view can be fetched by id by anybody.')
