# The Activity tab left out of the list's strip, whatever the space turns on.
#
# Reddens: list-views: "the list draws a tab for each of the five, and a space that turns one off loses its tab"
import io
p="/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx"
s=io.open(p,encoding='utf-8').read()
a="        { id: 'activity', label: t('list.viewActivity') },\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,""))
