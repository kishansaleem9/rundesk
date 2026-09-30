# WITH NO TEMPLATES, THE MENU STILL OFFERS USE, CREATE INSTANTLY AND UPDATE.
#
# Three items that open onto empty lists: offered, and impossible. With no
# templates only Save as template can be done, and only that is offered.
#
# Reddens: create-modal-templates: "with no templates, a template manager is offered Save as template and nothing else"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "  const any = templates.length > 0\n"
b = "  const any = true\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-8-everything-offered-with-no-templates: empty submenus offered')
