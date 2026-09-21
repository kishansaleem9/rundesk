# The padlock drawn and the switch still live — the panel offers a choice the
# server will refuse, which is worse than not offering it.
import io
p='/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
s=io.open(p,encoding='utf-8').read()
a="                    disabled={!!gate}\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"                    disabled={false}\n"))
