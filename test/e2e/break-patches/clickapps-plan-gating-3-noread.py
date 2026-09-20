# The gate applies at the moment of choosing and never again: a downgrade
# changes nothing anybody can see.
import io
p='/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
s=io.open(p,encoding='utf-8').read()
a="    if (!planRestrictsClickApps(plan.id)) return rows\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"    if (true) return rows\n"))
