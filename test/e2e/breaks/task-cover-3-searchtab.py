# Check 14 (the recorded decision) — the dead Search tab comes back.
#
# Put a Search tab in the strip. It has no provider behind it because there is
# no provider anywhere in this repo — that is the whole content of the comment
# in `cover-image-picker.tsx` — so it is the "Photos" box over six gradients,
# rebuilt with a better name. The suite has to be the thing that asks whether a
# Search tab can search, because the screenshot cannot tell the difference.
#
# Reddens: task-cover: "the Search tab stays absent, and the comment that says why has been re-checked"
import io
p = '/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx'
s = io.open(p, encoding='utf-8').read()
a = """              <TabsTrigger value="attachments" data-testid="cover-tab-attachments">
"""
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(
    s.replace(
        a,
        '              <TabsTrigger value="search" data-testid="cover-tab-search">Search</TabsTrigger>\n' + a,
    )
)
print('BROKE check 14: a Search tab is back in the picker with nothing behind it')
