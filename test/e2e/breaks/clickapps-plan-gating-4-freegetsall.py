# The ladder flattened at one rung: free reaches Custom Fields after all.
import io
p='/home/user/rundesk/apps/api/src/modules/spaces/space-presets.ts'
s=io.open(p,encoding='utf-8').read()
a="  customFields: 'pro',"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"  customFields: 'free',"))
