# The fields picker's search box filters nothing.
#
# The box is there, it is focusable, it holds what you type, and the value is
# still wired to `fieldSearch` — so the control is in every respect a working
# search box. The `.filter()` that uses it is what goes, and it goes in the
# shape of a simplification: a chain of `.filter().map()` over a list that is
# usually short, with the filter's predicate being the only line that mentions
# the query.
#
# A search that returns everything is worse than no search. With no box you
# scroll; with a box that lies you type, read a list that did not change, and
# conclude the field you are looking for does not exist.
#
# TWO CHECKS, AND THE SUITE WENT TO SOME LENGTH TO MAKE THE FIRST ONE
# MEANINGFUL. It seeds two fields whose names share a suffix, then scans for a
# substring that appears in exactly ONE of them — because a term matching
# nothing narrows to zero and would pass for the wrong reason, and a term every
# field shares narrows nothing and fails for the wrong reason. Both of those
# traps are the shape of this patch, which is why the term is computed rather
# than sliced.
#
# `found a term unique to one field` still passes: that check reads the seeded
# names, not the picker's response. The narrowing check and the
# nothing-matches check both fall.
#
# Reddens: ui-sweep: "and a term matching nothing shows nothing"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = """                    .filter((f) => f.name.toLowerCase().includes(fieldSearch.trim().toLowerCase()))
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: the fields picker lists every field whatever you type.')
