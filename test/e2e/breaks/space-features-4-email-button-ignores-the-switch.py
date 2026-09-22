# The Email to List button is on the toolbar whether or not the space wants it.
#
# `listEmail` is the switch with the least visible read site — one button,
# behind one `&&`, at the end of a row of them — and the one whose loss is
# hardest to notice, because nothing appears where it should not be. Something
# stays that should have gone.
#
# It also has a consequence the others do not. The other switches hide a way of
# LOOKING at work; this one hides the address that lets anybody with it put
# work into the list. A space that switched it off and got it back is not
# cluttered, it is reachable.
#
# EXACTLY ONE CHECK. `emailButton === 1` is asserted for the never-configured
# space and `=== 0` for the shut one, and only the second can fail here. The
# group-by and the filter fields are untouched.
#
# Reddens: space-features: "Email to List is gone from the toolbar"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "            {spaceFeatures.listEmail && (\n              <Button"
b = "            {true && (\n              <Button"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: the Email to List button ignores the space switch.')
