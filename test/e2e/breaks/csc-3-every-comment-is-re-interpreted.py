# The comment renderer stops gating on `hasBlockMarkdown` and lays every
# comment out as markdown.
#
# This is the change the suite's third paragraph exists for: "'we upgraded the
# renderer' is precisely the change that quietly re-interprets everything
# anybody has already written." And `mention-text.tsx` has the receipt — the
# first version ran the inline parser on the plain path and `file_name_here`
# came back as `filenamehere`, "because `_..._` is emphasis and the underscores
# were consumed. That is not a formatting preference, it is losing characters
# somebody typed."
#
# Under this patch every comment in the corpus goes through the block renderer.
# The seeded comment this suite plants — chosen for its punctuation, `and/or`
# and `file_name_here` — is the one the check reads, and it reads it FIRST,
# before anything is typed, because a corpus regression has to be caught before
# the feature is exercised rather than after.
#
# It is one condition, and removing a condition is what "simplify this" means.
# The block path renders plain text acceptably in most cases, which is exactly
# what makes it survivable long enough to ship: nothing looks wrong until a
# comment happens to contain an underscore pair.
#
# Reddens: comment-slash-commands: "and reads exactly as it was written — underscores and slashes survive"
import io
p = '/home/user/rundesk/apps/web/src/components/mention-text.tsx'
a = "    if (hasBlockMarkdown(text)) {"
b = "    if (true) {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mention-text.tsx: every comment is now rendered as markdown blocks.')
