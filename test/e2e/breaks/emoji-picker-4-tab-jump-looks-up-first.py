# `jumpTo` goes back to looking the section up before clearing the query.
#
# THIS IS THE REGRESSION THE FUNCTION'S OWN COMMENT DESCRIBES, restored. The
# comment stays in place, which is the point: the code and the comment disagree
# and the comment is the one telling the truth. That is the stale-reason defect
# arriving from the other direction — a correct explanation of behaviour the
# code no longer has, suppressing exactly the investigation that would find it.
#
# While a query is typed the category sections are not rendered, so their refs
# have been deleted from the map. Reading `sectionRefs` first therefore returns
# early — BEFORE `setQuery('')` runs — so every tab in the strip is dead the
# moment anybody types. Nothing moves and nothing says why, which is how it went
# unnoticed the first time.
#
# Two checks, and the second only exists because the first is not enough: the
# search box still holding "cat" is the cause, and Food & Drink not being on
# screen is what the person actually wanted. A fix that cleared the query and
# still failed to scroll would pass the first and fail the second.
#
# Reddens: emoji-picker: "pressing a tab mid-search clears the search" and
#   "and the category it names is on screen"
import io
p = '/home/user/rundesk/apps/web/src/components/emoji/emoji-picker.tsx'
a = """  const jumpTo = (id: CategoryId) => {
    setQuery('')
    setPendingJump(id)
  }
"""
b = """  const jumpTo = (id: CategoryId) => {
    const target = sectionRefs.current.get(id)
    if (!target) return
    setQuery('')
    setPendingJump(id)
  }
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('emoji-picker.tsx: jumpTo returns before clearing the search while filtering.')
