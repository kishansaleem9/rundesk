import io
p='/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
s=io.open(p,encoding='utf-8').read()
a="  'list.groupByStatus': 'Group: Status',"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"  'list.groupByStatus': 'Status',"))
