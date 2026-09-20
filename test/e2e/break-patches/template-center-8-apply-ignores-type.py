# `targetType` reduced to a badge: the card prints it, the facet counts it, the
# filter narrows on it, and apply makes a project regardless. The mirror of a
# facade — a column with no reader at the end of it.
import io
p='/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
s=io.open(p,encoding='utf-8').read()
a="    const targetType: TemplateTargetType = isTargetType(tpl.targetType) ? tpl.targetType : 'folder'"
assert s.count(a)==1, 'anchor not found exactly once'
io.open(p,'w',encoding='utf-8').write(
    s.replace(a,"    const targetType: TemplateTargetType = 'folder'"))
print('BREAK 8: apply ignores the template type and always makes a project')
