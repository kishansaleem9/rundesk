# The scope rail counting inside its own scope: standing in Built-in, "Workspace
# 10" becomes "Workspace 0" and the rail agrees with itself about nothing being
# anywhere.
import io
p='/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
s=io.open(p,encoding='utf-8').read()
a="        .from(projectTemplates).where(scopeBasis).groupBy(projectTemplates.isBuiltIn),"
assert s.count(a)==1, 'anchor not found exactly once'
io.open(p,'w',encoding='utf-8').write(
    s.replace(a,"        .from(projectTemplates).where(countBasis).groupBy(projectTemplates.isBuiltIn),"))
print('BREAK 6: scope counts are taken inside the chosen scope — Built-in counts the built-ins among the built-ins')
