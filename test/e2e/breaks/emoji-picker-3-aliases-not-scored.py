# Search stops consulting the hand-written alias table and matches on Unicode
# names only.
#
# `EMOJI_ALIASES` stays exactly where it is, exported, populated and covered by
# its own unit test — this deletes only the two lines in `scoreEmoji` that read
# it. That is what makes it a plausible change rather than a deletion: the table
# is still there to read, so nothing looks missing, and every emoji whose name
# contains the query still comes back. Searching "smile", "fire", "heart" or
# "rocket" is unaffected, because Unicode uses those words.
#
# What breaks is every shortcode the industry has typed for a decade and Unicode
# has never used. 🎉 is a "party popper"; nobody types that. The suite picks
# "tada" precisely because it appears in no Unicode name at all, so finding the
# popper proves the alias table is wired to the real dataset rather than to a
# fixture — and with these two lines gone the first hit is a tadpole.
#
# Reddens: emoji-picker: "searching \"tada\" finds 🎉 — a word Unicode never uses"
import io
p = '/home/user/rundesk/apps/web/src/lib/emoji-picker.ts'
a = """  const aliases = EMOJI_ALIASES[entry.char]
  if (aliases?.includes(q)) return 85
  if (name.startsWith(`${q} `) || name.startsWith(`${q}-`)) return 70
  if (aliases?.some((a) => a.startsWith(q))) return 60
"""
b = """  if (name.startsWith(`${q} `) || name.startsWith(`${q}-`)) return 70
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('emoji-picker.ts: scoring no longer reads the alias table.')
