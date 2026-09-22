# `targetType` reduced to a badge: the card prints it, the facet counts it, the
# filter narrows on it, and apply makes a folder regardless. The mirror of a
# facade — a column with no reader at the end of it.
# THE CLAIM WAS AIMED AT THE WRONG CHECK.
# It named "and a List template refuses to apply with no target", which passes —
# the refusal is still there. What falls is the case above it: a SPACE template
# is told it needs a target space, so the type is being ignored in the
# direction that breaks the thing that should work rather than the thing that
# should refuse.
#
# Reddens: template-center: "applying a Space template makes a space, with no target space asked for"
import io
p='/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
s=io.open(p,encoding='utf-8').read()
a="    const targetType: TemplateTargetType = isTargetType(tpl.targetType) ? tpl.targetType : 'folder'"
b="    const targetType: TemplateTargetType = (['folder'] as TemplateTargetType[])[0]"
assert s.count(a)==1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p,'w',encoding='utf-8').write(s.replace(a,b))
print('BREAK 8: apply ignores the template type and always makes a folder')
