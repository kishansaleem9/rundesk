# A preset treated as an explicit request: three of frame 07:06's four cards
# become un-clickable on free, and the person gets blamed for choosing one.
#
# Reddens: clickapps-plan-gating: "a preset that wants a gated ClickApp is narrowed, not refused"
import io
p='/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
s=io.open(p,encoding='utf-8').read()
a="    const features = data.features ?? preset?.features.filter((f) => allowedClickApps.includes(f))\n"
assert s.count(a)==1
b=("    const features = data.features ?? preset?.features\n"
   "    if (features) this.assertClickAppsAllowed(plan.id, features)\n")
io.open(p,'w',encoding='utf-8').write(s.replace(a,b))
