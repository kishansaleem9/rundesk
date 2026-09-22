# List switchable off — every list falls back to it, so the space renders nothing.
#
# Reddens: space-wizard-views: "List is Required and cannot be switched off"
import io
p='/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
s=io.open(p,encoding='utf-8').read()
a="                  disabled={required}\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"                  disabled={false}\n"))
