# The emoji list becomes a static import, so Vite inlines it into the main
# bundle and there is no separate chunk at all.
#
# This is the tidying that looks like removing an indirection. `loadEmojiCatalog`
# is an async function wrapping a dynamic import that is awaited on first open;
# making the import static deletes a promise, a memo, a failure state and a
# retry button's reason to exist. Every unit test passes — from source a dynamic
# and a static import of the same module give the same object — and the picker
# behaves identically.
#
# It also puts 34 kB of emoji names in the bundle every visitor downloads before
# the login screen paints. The two checks that notice are the ones that look at
# the NETWORK rather than the screen: no `emoji-data` chunk is ever requested,
# so neither "fetched on open" nor "came back as JavaScript" has anything to
# find. "the 1,914-emoji chunk has not been downloaded yet" still passes,
# correctly — it never was downloaded, because it never existed.
#
# Reddens: emoji-picker: "the emoji chunk was fetched on open, not before" and
#   "and came back as JavaScript"
import io
p = '/home/user/rundesk/apps/web/src/lib/emoji-picker.ts'
a = "    const pending = import('./emoji-data').then((mod) => {\n"
b = "    const pending = Promise.resolve(EMOJI_DATA_STATIC).then((mod) => {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)

# The static import that makes it one bundle.
imp = "import { EMOJI_BY_CATEGORY as _EMOJI_BY_CATEGORY } from './emoji-data'\n"
head = 'export const EMOJI_ALIASES: Record<string, string[]> = {\n'
assert s.count(head) == 1, f'alias-table anchor appears {s.count(head)} times, expected exactly 1'
s = s.replace(
    head,
    imp
    + 'const EMOJI_DATA_STATIC = { EMOJI_BY_CATEGORY: _EMOJI_BY_CATEGORY }\n\n'
    + head,
)
io.open(p, 'w', encoding='utf-8').write(s)
print('emoji-picker.ts: emoji-data is imported statically, so there is no chunk.')
