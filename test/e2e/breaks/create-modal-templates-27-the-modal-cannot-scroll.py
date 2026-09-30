# THE CREATE MODAL CANNOT SCROLL, AS IT COULD NOT
# (`found-30-sep/create-modal-cuts-off-create`): the backdrop is fixed to the
# window with nothing to scroll in, so in a short window Create task lies below
# the edge and cannot be pressed.
#
# Reddens: create-modal-templates: "in a window 700 high, with the template chosen and the form filled in, Create task lies below the window’s edge and the modal scrolls to it: pressing it makes the task"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '      className="fixed inset-0 z-[9999] overflow-y-auto bg-black/55 backdrop-blur-[1px] flex items-start justify-center pt-24 px-4"\n'
b = '      className="fixed inset-0 z-[9999] bg-black/55 backdrop-blur-[1px] flex items-start justify-center pt-24 px-4"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-27-the-modal-cannot-scroll: the backdrop does not scroll')
