# AN IMPORT ITEM NO TEMPLATE HOLDS IS PASSED OVER, and the template is made.
# (`found-30-sep/load-template-takes-every-attribute`, batch 19)
# Reddens: create-modal-templates: "an import item a template cannot hold is refused in words, 400 “Unknown import item: attachments”, and no template is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = '    if (!(TEMPLATE_IMPORT_ITEMS as readonly string[]).includes(key)) throw new BadRequestException(`Unknown import item: ${key}`)\n'
b = '    if (!(TEMPLATE_IMPORT_ITEMS as readonly string[]).includes(key)) continue // BROKEN: any import item is taken\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-41-any-import-item-is-taken: an unknown import item is ignored')
