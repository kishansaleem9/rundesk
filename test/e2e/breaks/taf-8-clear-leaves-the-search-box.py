# Clear resets the applied search but not the box it came from, so the debounce
# puts the same term straight back and the feed never recovers.
# IT RAN GREEN TWICE, AND MY FIRST DIAGNOSIS WAS WRONG BOTH TIMES.
#
# The reasoning in the header and in the check's comment was that removing
# `setSearchDraft('')` lets the 200ms debounce put the term straight back. It
# does not: the debounce effect is keyed on `[searchDraft]`, and Clear no longer
# CHANGES that — so the effect never re-runs, `search` stays empty, and the feed
# really does come back and really does stay back. The check was right to pass,
# and the polling I added to it was a stronger check for a fact that was never
# in doubt.
#
# What the patch actually leaves is a STALE BOX: the input still showing a term
# over a list that is no longer filtered, and the next keystroke re-applying a
# search the person has just cleared. Nothing asserted it, which is why two
# rounds of looking at the feed found nothing. `task-activity-filter` asserts
# the box now — 15 checks → 16.
#
# PREDICTED ONE.
#
# Reddens: task-activity-filter: "and Clear empties the search box as well as
#   the filter it applied"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """            setSearchDraft('')
            setSearch('')
            setActionFilter('')"""
b = """            setSearch('')
            setActionFilter('')"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: Clear leaves the search box filled, so the debounce re-applies the term.")
