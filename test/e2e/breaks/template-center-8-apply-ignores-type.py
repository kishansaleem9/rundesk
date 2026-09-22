# `targetType` reduced to a badge: the card prints it, the facet counts it, the
# filter narrows on it, and apply makes a folder regardless. The mirror of a
# facade — a column with no reader at the end of it.
# Reddens: template-center: "and a List template refuses to apply with nowhere to put the list"
#
# WRITTEN THE LONG WAY ON PURPOSE. The obvious form,
#
#     const targetType: TemplateTargetType = 'folder'
#
# does not compile: TypeScript narrows a const initialised with a literal to
# that literal even when the annotation is the union, so the five `=== 'list'`
# and `=== 'space'` comparisons below it all become TS2367 "no overlap" and the
# patch reports BUILD FAILED instead of reddening anything. That is the same
# narrowing trap `{false && …}` sets, and it has now cost two break patches.
# Indexing an array typed as the union produces the union, so the value is
# still always 'folder' and every comparison downstream still typechecks.
import io
p='/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
s=io.open(p,encoding='utf-8').read()
a="    const targetType: TemplateTargetType = isTargetType(tpl.targetType) ? tpl.targetType : 'folder'"
b="    const targetType: TemplateTargetType = (['folder'] as TemplateTargetType[])[0]"
assert s.count(a)==1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p,'w',encoding='utf-8').write(s.replace(a,b))
print('BREAK 8: apply ignores the template type and always makes a folder')
