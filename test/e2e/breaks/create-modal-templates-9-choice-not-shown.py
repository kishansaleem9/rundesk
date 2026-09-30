# THE TEMPLATE CHOSEN UNDER USE TEMPLATE IS NOT SHOWN ON THE BUTTON.
#
# The choice is made and kept, and the button goes on reading "Templates", so
# nothing on screen says the next Create task will be made from a template.
#
# Reddens: create-modal-templates: "the template chosen is shown on the Templates button, and the X beside it takes the choice back"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "              {chosen ? t('quickCreate.templateChosen', { name: chosen.name }) : t('quickCreate.templates')}\n"
b = "              {t('quickCreate.templates')}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-9-choice-not-shown: the button never names the template chosen')
