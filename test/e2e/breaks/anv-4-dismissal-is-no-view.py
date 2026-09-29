# A DISMISSAL NO LONGER COUNTS ITS DISMISSER AS A VIEWER.
# Reddens: announcement-views: "a member who dismisses without having viewed is counted a viewer too, once, and two dismissals by them are one"
import io
p = '/home/user/rundesk/apps/api/src/modules/announcements/announcements.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    await this.live(workspaceId, announcementId)\n    await this.recordView(announcementId, userId)\n'
b = '    await this.live(workspaceId, announcementId)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('anv-4-dismissal-is-no-view: a dismissal records no view')
