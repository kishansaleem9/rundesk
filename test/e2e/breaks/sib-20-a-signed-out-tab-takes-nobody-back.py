# A TAB THAT SIGNED ITSELF OUT STAYS DEAF TO ITS PERSON'S NEXT SIGN-IN (`found-7-oct/a-tab-that-saw-the-sign-out-misses-the-sign-in`).
#
# After another tab's sign-out, the listening tab's own next request finds no
# session and it clears its store. The person's sign-in in the other tab after
# that is read back from the shared storage, and the store's change opens the
# socket again. Drop the read-back and the tab, which names nobody, hears the
# sign-in and does nothing: its socket stays closed on its list.
#
# Reddens: session-in-the-browser:
#   "when another tab of the same browser has signed itself out after the person signed out elsewhere, their next sign-in there gives it back its realtime socket without a reload: a message in their own private channel is heard there, and the list it shows draws a task made after, as before"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = '      void useAuthStore.persist.rehydrate()\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-20-a-signed-out-tab-takes-nobody-back: a tab that signed itself out no longer reads its person back')
