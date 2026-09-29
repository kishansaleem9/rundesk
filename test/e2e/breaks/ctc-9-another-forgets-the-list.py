# CREATE AND START ANOTHER CLEARS THE LIST TOO: THE NEXT TASK HAS NOWHERE TO GO UNTIL IT IS PICKED AGAIN.
# Reddens: create-task-chevron: "Create and start another makes one task from what was typed and leaves the modal open on an empty form, in the same space, project and list"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '    setWatcherIds([])\n    setAttachments([])\n  }\n'
b = "    setWatcherIds([])\n    setAttachments([])\n    setListId('')\n  }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ctc-9-another-forgets-the-list: Create and start another drops the list')
