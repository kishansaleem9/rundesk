# The 34 kB emoji chunk is fetched the moment the chat page renders, instead of
# the first time somebody opens the picker.
#
# The plausible version of this change is a performance one: the picker's first
# open pauses while 1,914 emoji come down, and warming it at module scope makes
# that pause disappear. It reads as a straight improvement. What it actually
# does is charge every person who opens chat for a list most of them never ask
# for, which is the entire reason the chunk is split out — and `emoji-picker.tsx`
# is statically imported by `chat-composer.tsx`, so module scope here IS page
# load.
#
# The check it reddens is the one that only ever looks BEFORE the click. Nothing
# else in the suite can see this: the list still arrives, search still works,
# every count is still right, and the picker is faster. A suite that only
# checked the picker worked would call this a win.
#
# Reddens: emoji-picker: "and the 1,914-emoji chunk has not been downloaded yet"
import io
p = '/home/user/rundesk/apps/web/src/components/emoji/emoji-picker.tsx'
a = "import { reloadForStaleChunks } from '../../lib/chunk-reload'\n"
b = (
    "import { reloadForStaleChunks } from '../../lib/chunk-reload'\n"
    "\n"
    "// Warm the list so the first open does not pause on the network.\n"
    "void loadEmojiCatalog()\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('emoji-picker.tsx: the catalog is loaded at module scope, so on page load.')
