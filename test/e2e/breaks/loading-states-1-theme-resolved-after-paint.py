# The inline boot script stops setting the theme class, so the shipped
# `class="dark"` stands until the bundle parses.
#
# The read stays, the try/catch stays, the sidebar half of the same script stays
# — only the two lines that touch `classList` go. That is what makes it the
# plausible version: the store sets the theme on mount anyway, so from every
# angle except the first frame this is dead code being removed. `index.html`'s
# own comment says why it is not ("a light-theme user used to get a dark flash
# on every load"), and the comment survives the patch, which is the stale reason
# arriving the other way round.
#
# Nothing in the app is broken afterwards. A light-theme session simply opens
# dark and corrects itself once the JS lands — invisible on a fast connection,
# which is why the suite holds the entry chunk for three seconds before looking.
# The check reads the `<html>` class while the bundle is still outstanding, and
# that is the only moment this is observable at all.
#
# Reddens: loading-states: "a light-theme session paints light from the first frame"
import io
p = '/home/user/rundesk/apps/web/index.html'
a = """          document.documentElement.classList.remove('light', 'dark')
          document.documentElement.classList.add(dark ? 'dark' : 'light')
"""
b = """          void dark
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('index.html: the theme class is no longer resolved before paint.')
