# A Location's address kept and never asked of the geocoder.
#
# Reddens: list-views: "a placed address is a marker at the geocoder’s point, and a task with no location is listed aside"
import io
p="/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts"
s=io.open(p,encoding='utf-8').read()
a="      const at = await geocode(value)\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"      const at = null as Point | null\n"))
