# SAVE AS TEMPLATE ASKS FOR THE NAME IN A BROWSER PROMPT.
#
# `window.prompt` is the defect this product keeps removing: unstyled, in no
# language but the browser's, and dismissed it saves nothing and says nothing.
#
# Reddens: create-modal-templates: "Save as template asks for the template’s name in the modal itself, starting from the typed title, and in no browser prompt"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "          onSave={() => openTemplatePanel({ kind: 'save' }, title.trim())}\n"
b = "          onSave={() => { const name = window.prompt(t('quickCreate.templateNamePlaceholder'), title.trim()); if (name) openTemplatePanel({ kind: 'save' }, name) }}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-10-name-asked-in-a-prompt: the name is asked in window.prompt')
