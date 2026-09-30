# THE EXIT IS ENDED TOO LATE: after the leaving layer has answered the Escape. (`found-30-sep/leaving-menu-takes-the-next-escape`)
#
# The Escape still ends the exit, but the listener is in the window's bubble
# phase, which comes after every layer's listener on the document (capture
# phase). Two things follow, and both were measured:
#
#  - An Escape a menu's caller stops (the create modal's menus stop the one
#    that closes them) never reaches the window, so the second Escape, meant
#    for the modal, still stops at the leaving menu and the modal stays open.
#  - The Escape that CLOSES a menu reaches the listener after the close, when
#    the menu already reads `closed`, and ends that menu's exit at once. Every
#    menu closed with Escape vanishes instead of leaving, so the rounds that
#    hold an exit after an Escape find the menu gone: the four "pressed again
#    while it is still leaving" rounds and the task menu's Escape round.
#
# The fix works only because it runs first, while the menu still reads `open`.
#
# Reddens: menu-reopen:
#   "the task’s ⋯ is pressed again while the menu it closed is still leaving (in the page, data-state=\"closed\")"
#   "the sidebar’s ⋯ on a list is pressed again while the menu it closed is still leaving (in the page, data-state=\"closed\")"
#   "the sidebar’s + on a space is pressed again while the menu it closed is still leaving (in the page, data-state=\"closed\")"
#   "the top bar’s user menu is pressed again while the menu it closed is still leaving (in the page, data-state=\"closed\")"
#   "the task’s ⋯ menu is closed with Escape, and a second Escape is pressed while it is still leaving (in the page, data-state=\"closed\")"
#   "that second Escape goes on to the page as though no menu were there: not stopped, and not marked handled"
#   "that second Escape reaches the create modal under the menu, and closes it"
import io
p = '/home/user/rundesk/packages/ui/src/components/dropdown-menu.tsx'
s = io.open(p, encoding='utf-8').read()
a = "    win.addEventListener('keydown', onKeyDown, true)\n"
b = "    win.addEventListener('keydown', onKeyDown) // BROKEN: bubble phase, after the layer has answered\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('menu-reopen-8-the-exit-ends-after-the-layer-answered: the Escape ends the exit in the bubble phase')
