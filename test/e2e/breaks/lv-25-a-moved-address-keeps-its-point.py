# A changed address keeps the point the first one was placed at.
#
# Reddens: list-views: "changing the address moves the marker"
import io
p="/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts"
s=io.open(p,encoding='utf-8').read()
a="        .set({ value: stored, updatedAt: new Date() })"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"        .set({ value: { ...(existing[0].value as object), v: value }, updatedAt: new Date() })"))
