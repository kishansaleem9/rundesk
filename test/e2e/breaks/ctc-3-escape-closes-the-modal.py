# ESCAPE ON THE OPEN MENU ALSO REACHES THE MODAL, WHICH CLOSES AND THROWS AWAY THE HALF-FILLED TASK.
# Reddens: create-task-chevron: "Escape closes that menu and leaves the modal open with what was typed in it, having made nothing"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '              onEscapeKeyDown={(e) => e.stopPropagation()}\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ctc-3-escape-closes-the-modal: the menu lets its Escape through to the modal')
