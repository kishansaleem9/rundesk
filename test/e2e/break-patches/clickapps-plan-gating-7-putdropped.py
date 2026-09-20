# `features` back to being declared by the controller and dropped by the
# service: PUT /spaces/:id answers 200 and changes nothing.
import io
p='/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
s=io.open(p,encoding='utf-8').read()
a="    if (data.features !== undefined) {\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"    if (false && data.features !== undefined) {\n"))
