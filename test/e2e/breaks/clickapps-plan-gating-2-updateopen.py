# The gate fires on create only — so you create on one plan and edit on another.
import io
p='/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
s=io.open(p,encoding='utf-8').read()
a="        this.assertClickAppsAllowed(plan.id, wanted)\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,''))
