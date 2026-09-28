# The create gate removed: the wizard still padlocks Custom Fields and curl
# still gets it. A client-only gate is not a gate.
#
# Reddens: clickapps-plan-gating: "POST /spaces asking for Custom Fields on a free plan is refused with 403"
import io
p='/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
s=io.open(p,encoding='utf-8').read()
a="    if (data.features) this.assertClickAppsAllowed(plan.id, data.features)\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,''))
