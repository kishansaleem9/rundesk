# The cursor is the page's NEWEST entry, so the next page repeats this one.
#
# Reddens: list-views: "sixty entries page as fifty and ten, none twice, none lost"
import io
p="/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
s=io.open(p,encoding='utf-8').read()
a="      nextBefore: rows.length > limit ? page[page.length - 1].id : null,"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"      nextBefore: rows.length > limit ? page[0].id : null,"))
