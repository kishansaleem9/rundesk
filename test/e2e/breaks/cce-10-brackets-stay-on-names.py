# ClickUp's `[a, b]` KEEPS ITS BRACKETS: `[Admin` matches no member and `[weekly` is the tag.
# Reddens: clickup-current-export: "the member is assigned by name and the tags are on the task; the name no member has is reported, not assigned"
import io
p = '/home/user/rundesk/packages/imports/src/values.ts'
a = "  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1)\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cce-10-brackets-stay-on-names: applied")
