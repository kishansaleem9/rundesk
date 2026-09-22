# Frequently Used stops being written to localStorage, so it is rebuilt from
# nothing every time the picker mounts.
#
# The facade, exactly: within one open of the picker the row works perfectly.
# `bumpFrequent` still runs, `countsRef` still carries the running count,
# `setCounts` still re-renders, and the emoji you just clicked really does move
# to the front of Frequently Used while you are looking at it. `readFrequent`
# is untouched and still reads the key — there is simply never anything under
# it, so it returns the empty default and the row is seeded from the built-in
# order again.
#
# That is what makes a one-open check useless here. The suite closes the picker
# and re-opens it, which is the only way to tell a row that remembers from a row
# that is recomputed — and `readFrequent` being intact is why the failure reads
# as "Frequently Used leads with 😀" rather than as an error.
#
# PREDICTED ONE AND IT RAN GREEN, WHICH FOUND TWO DEFECTS IN THE CHECK. Both
# are the same mistake in different clothes, and either alone was enough to
# make the assertion vacuous:
#
#  - it picked `.first()` — whatever ALREADY led Frequently Used — so "it leads
#    next time" was satisfied by the emoji not moving. True of a row that
#    remembers and equally true of a row rebuilt from the built-in order on
#    every mount. It now picks the SECOND entry and asserts it has overtaken
#    the first, which is only true if the click was counted.
#  - it re-opened the picker by clicking the trigger twice, which does not
#    remount the component. The count lives in `useState(() => readFrequent())`
#    — storage is read once, at mount — with the running total in a ref beside
#    it, so a picker that wrote nothing down still shows the right order for as
#    long as it stays open. It reloads the page now. Third time in this audit
#    that a persistence check has been satisfied by an in-memory copy.
#
# One check, once the check could fail: the insertion into the draft happens
# through `onSelect`, which this does not touch.
#
# Reddens: emoji-picker: "and it leads Frequently Used next time"
import io
p = '/home/user/rundesk/apps/web/src/components/emoji/emoji-picker.tsx'
a = """      const next = bumpFrequent(countsRef.current, char)
      countsRef.current = next
      setCounts(next)
      writeFrequent(next)
"""
b = """      const next = bumpFrequent(countsRef.current, char)
      countsRef.current = next
      setCounts(next)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('emoji-picker.tsx: Frequently Used is never written, so it never survives a mount.')
