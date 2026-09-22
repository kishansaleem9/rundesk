# cmdk's own filtering is switched back on over the server's results.
#
# THE DEFECT WHOSE VISIBLE SYMPTOM WAS "NO MATCHES OVER RESULTS THE BROWSER WAS
# HOLDING", restored by deleting one prop. `shouldFilter: false` is a single
# line with no comment at its call site, and a `<Command>` that does not filter
# reads like a component being used wrong — cmdk filters, that is what it is
# for. Turning it back on is the change somebody makes while tidying an
# unexplained override.
#
# What it does is discard everything the search engine just computed. Meili
# matched a task on a word in its DESCRIPTION, and cmdk then re-filters the
# rendered rows by their visible text — so a row whose title does not contain
# the query is dropped, and a palette holding four results announces "No
# matches". It also re-sorts by its own score, which throws away the server's
# ranking: `ENTITY_ORDER` puts tasks above docs, and cmdk does not know that.
#
# FOUR CHECKS, AND THE SET IS WHY THIS SUITE IS WORTH ITS LENGTH: the row is
# dropped, the snippet that justified it goes with it, "No matches" appears over
# results the client has, and the ordering is re-scored. Each one is a separate
# consequence of the same line, and a suite that only asserted "some results
# render" would see none of them.
#
# The `/` command mode has its own filtering and must survive — `/ still
# narrows commands itself` passes either way, which is what tells a reader this
# is about the results list and not about the palette.
#
# Reddens: command-palette: "and the matching snippet is rendered with it" and
#   "the palette does not claim \"no matches\" while holding results" and
#   "and the server’s ordering is preserved, not re-scored"
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
a = """      commandProps={{ shouldFilter: false }}
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('command-palette.tsx: cmdk re-filters and re-sorts the server results.')
