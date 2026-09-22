# `hasBlockMarkdown` stops recognising a blockquote, so a comment containing
# `> ` takes the plain path and shows the two characters.
#
# This is the half of the item that makes the other half worth anything. The
# suite's own header: "A slash command inserting `## ` into that box would have
# left two hashes on screen for ever. So slash commands in a comment are worth
# nothing until comments render markdown, and this suite checks the pair
# together: the block is inserted, and the posted comment shows it as a block."
#
# Under this patch the slash menu works perfectly — opens, narrows, inserts
# `> `, removes the `/quo` — and the posted comment reads `> like this`. The
# feature is complete and useless, which is the exact state the previous item
# refused to ship the "+" menu entry into.
#
# One line out of eight in a loop of near-identical tests, and the one whose
# regex is shortest. Every other block kind still renders: a list, a table, a
# fence and a callout are all untouched, so nothing else in the product changes
# and no other suite notices.
#
# ONE CHECK. The insertion checks above it pass — they read the textarea, not
# the posted comment — and the corpus check passes too, because a comment with
# no blocks at all was always going to take the plain path. Only the round trip
# through the renderer fails.
#
# Reddens: comment-slash-commands: "and comes back rendered as a quote, not as \"> \""
import io
p = '/home/user/rundesk/apps/web/src/components/markdown.tsx'
a = "    if (/^>\\s?/.test(line)) return true\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('markdown.tsx: a blockquote no longer counts as block markdown.')
