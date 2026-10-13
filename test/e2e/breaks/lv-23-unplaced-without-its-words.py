# An address the geocoder could not place listed as if there were none.
#
# Reddens: list-views: "an address the geocoder cannot place is listed with its words, not drawn"
import io
p="/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
s=io.open(p,encoding='utf-8').read()
a="      else unplaced.push({ taskId: r.taskId, title: r.title, address })"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"      else unplaced.push({ taskId: r.taskId, title: r.title, address: null })"))
