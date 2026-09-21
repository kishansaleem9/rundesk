# The facet counts taken over the SELECTED set instead of the corpus — i.e.
# counting the array the page is about to be handed. Every count still looks
# right until a box is ticked, at which point the siblings report 0.
import io
p='/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
s=io.open(p,encoding='utf-8').read()
a="        .from(projectTemplates).where(countBasis).groupBy(projectTemplates.targetType),"
assert s.count(a)==1, 'anchor not found exactly once'
io.open(p,'w',encoding='utf-8').write(
    s.replace(a,"        .from(projectTemplates).where(and(...selected)).groupBy(projectTemplates.targetType),"))
print('BREAK 2: type counts are now taken over the narrowed set — the confident zero')
