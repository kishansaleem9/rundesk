# Try again re-runs the import instead of reloading the document.
#
# THE DEAD CONTROL, and the one this suite exists to catch. Reading the code you
# would call this correct: `setAttempt` bumps a counter the load effect depends
# on, so the import runs again, and the loader has already been fixed not to
# remember a rejected promise. Every unit test agrees. From a dev server it even
# works, because Vite serves the module fresh.
#
# It cannot work in a browser. A dynamic import that failed is recorded as
# failed in the module map, and every later import of that same URL returns the
# recorded failure without touching the network — verified in this Chromium: a
# second import of an aborted URL makes no request at all. So the button spins
# and settles back into the same failure state, for as long as the person keeps
# pressing it. A reload is the only thing that gets a fresh module map, and it
# re-reads index.html, which is also how a chunk whose hash moved in a deploy
# gets picked up.
#
# Two checks, and the second is the one that says the button was not merely
# ineffective but deceptive: no reload happens, and the list is still absent
# afterwards. "and does not pretend to re-fetch in the dead document" stays
# GREEN — correctly, and it is worth saying why: the browser makes no request
# for the recorded-failed URL, so the request count really is unchanged. That
# check is about the picker not lying about the network, not about the retry
# working.
#
# Reddens: emoji-picker: "Try again reloads rather than re-importing a module the browser has already given up on"
#   and "and the list is there after it"
import io
p = '/home/user/rundesk/apps/web/src/components/emoji/emoji-picker.tsx'
a = """              onClick={() => {
                if (!reloadForStaleChunks(true)) setAttempt((n) => n + 1)
              }}
"""
b = """              onClick={() => setAttempt((n) => n + 1)}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('emoji-picker.tsx: Try again re-imports a module the browser has already failed.')
