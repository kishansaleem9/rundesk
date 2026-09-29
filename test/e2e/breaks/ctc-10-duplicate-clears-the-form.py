# CREATE AND DUPLICATE CLEARS THE FORM, AS START ANOTHER DOES: THERE IS NOTHING LEFT TO MAKE THE COPY FROM.
# Reddens: create-task-chevron: "Create and duplicate makes one task and leaves the modal open holding the content it was made from, in the same list"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "    if (then === 'another') startAnother()\n"
b = '    startAnother()\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ctc-10-duplicate-clears-the-form: Create and duplicate keeps nothing')
