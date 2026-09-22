# The server stops saying which ClickApps this plan cannot reach, so the panel
# has nothing to padlock — the feature quietly becomes "never built".
#
# Reddens: clickapps-plan-gating: "and told, per ClickApp, which tier would unlock it"
import io
p='/home/user/rundesk/apps/api/src/modules/spaces/spaces.controller.ts'
s=io.open(p,encoding='utf-8').read()
a="      lockedFeatures: lockedClickApps(plan.id),\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"      lockedFeatures: [],\n"))
