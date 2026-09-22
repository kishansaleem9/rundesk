# The panel becomes decoration: what was toggled never reaches the request.
#
# Reddens: space-wizard-views: "switching Team on puts it in the POST body"
import io
p='/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
s=io.open(p,encoding='utf-8').read()
a="          viewConfig: { enabledViews: effectiveViews, defaultView: effectiveDefaultView },\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,''))
