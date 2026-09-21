# The list view offered five switches, two of which could change nothing.
# Reddens: list-view-controls: "the list view offers the three columns it actually draws"
import io
p='/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s=io.open(p,encoding='utf-8').read()
a="  { key: 'col:status', labelKey: 'list.columns.status', views: ['table'] },"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"  { key: 'col:status', labelKey: 'list.columns.status', views: ['list', 'table'] },"))
