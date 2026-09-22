# The boot skeleton is trimmed to the top bar: the icon rail and the six content
# blocks go, leaving three shapes.
#
# This is the review comment that sounds reasonable — fifteen shimmering
# rectangles inline in `index.html` is a lot of markup shipped to every visitor
# to decorate a wait most of them never see, and a bar is enough to say "an app
# is coming". The sr-only announcement stays, `role="status"` stays, the wait is
# still announced and still not blank. It is smaller, not broken.
#
# What it stops being is the thing the 7 Aug note asked for — "woh icons hi hon",
# the shell the app is about to render. Three grey bars at the top of an
# otherwise empty page is closer to the blank screen than to the shell.
#
# PREDICTION, AND THE PART OF IT THAT CANNOT BE READ OFF THE SOURCE. Three
# checks count `#boot i` against a floor of eight and all three must fail: the
# boot shape count in section 1, the same count in section 6's deep link, and
# section 6's "every skeleton clears", which is an AND over that same count.
# `the screen is not blank` is the one I cannot predict by reading — it counts
# every element with a background or text over 8px in the viewport, which
# includes containers, and whether what is left comes to more than five is a
# question about computed style rather than about markup. Whatever the run says,
# it gets written here.
#
# Reddens: loading-states: "the shell is drawn while the bundle loads" and
#   "the shell is drawn as shapes" and "every skeleton clears once the route lands"
import io
p = '/home/user/rundesk/apps/web/index.html'
rail = """      <div class="rail" aria-hidden="true">
        <i></i><i></i><i></i><i></i><i></i><i></i>
      </div>
"""
main = """        <div class="main">
          <i style="width: 240px; height: 26px"></i>
          <i style="height: 64px"></i>
          <i style="height: 64px"></i>
          <i style="height: 64px"></i>
          <i style="height: 64px; opacity: 0.6"></i>
          <i style="height: 64px; opacity: 0.3"></i>
        </div>
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(rail) == 1, f'rail anchor appears {s.count(rail)} times in {p}, expected exactly 1'
assert s.count(main) == 1, f'main anchor appears {s.count(main)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(rail, '').replace(main, ''))
print('index.html: the boot skeleton is three shapes, not fifteen.')
