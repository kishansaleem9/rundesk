# THE CREATOR GIVES THE CURSOR BACK TO NOTHING WHEN IT CLOSES.
#
# The state `found-29-sep/create-modal-returns-focus-to-nothing` was found in:
# the modal is a portal with a document Escape listener, not a dialog, and
# nothing hands the cursor back when it unmounts, so it falls to `<body>`. The
# opener is still remembered; it is just never given the cursor again.
#
# Reddens: comment-plus-menu: "and the cursor goes back to the “+” the creator was opened from, not to the page"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = """    if (opener?.isConnected) opener.focus({ preventScroll: true })
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the creator gives the cursor back to nothing when it closes.')
