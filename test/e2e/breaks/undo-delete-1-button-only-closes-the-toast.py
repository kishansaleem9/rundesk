# The toast's Undo button stops calling `run()`. It still appears, still says
# "Undo", and pressing it still closes the toast — and the list stays deleted.
#
# This is the defect the suite names in its own comment: "A button that only
# closes the toast would pass every check above this one." Under this patch the
# premise checks pass, the row-in-tree check passes, the delete-really-deletes
# check passes, the toast-is-offered check passes, and exactly one check
# reddens — the one that reads the list back from the API after pressing.
#
# WHY IT IS THE BEST-SHAPED PATCH IN THIS SET. Removing the whole `offerUndo`
# call would also redden this check, but it reddens the toast check first and
# then the click throws on an element that is not there, so the run stops early
# and prints "only 6 of 11 checks ran". A patch that ends the run tells you the
# suite noticed something; a patch that leaves all eleven running tells you
# WHICH check noticed. This one leaves all eleven running.
#
# `run` stays defined and is still cleared by `onAutoClose`/`onDismiss`, so
# nothing else in the file changes shape — the button is simply wired to
# nothing, which is what a dead control looks like from the outside.
#
# Reddens: undo-delete: "and pressing it brings the list back"
import io
p = '/home/user/rundesk/apps/web/src/lib/undoable-delete.ts'
a = "    action: { label: opts.undoLabel, onClick: () => void run() },"
b = "    action: { label: opts.undoLabel, onClick: () => {} },"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('undoable-delete.ts: the Undo button now only closes the toast.')
