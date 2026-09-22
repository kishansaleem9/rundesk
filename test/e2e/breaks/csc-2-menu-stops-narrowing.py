# The slash menu stops filtering and always offers all ten blocks.
#
# `matchBlocks(COMPOSER_BLOCKS, commentSlashQuery, t)` becomes
# `matchBlocks(COMPOSER_BLOCKS, '', t)`, and `matchBlocks` returns everything
# for a blank query — so typing `/quo` shows Heading, Bullet list, Numbered
# list, To-do, Quote, Code, Table, Divider, Banner and Warning, in that order,
# with the thing you asked for fifth.
#
# THIS PATCH WOULD HAVE RUN GREEN YESTERDAY. The narrowing check asserted that
# `comment-slash-quote` is VISIBLE after typing `/quo` — and it is visible in an
# unfiltered menu too, because Quote is one of the ten. A check that names only
# what should be there cannot see a filter that has stopped filtering; the
# absence of something that does not match is the whole of the claim. The check
# now also requires `comment-slash-table` to be gone.
#
# The edit is the shape a debugging session leaves behind: blank the query to
# see the full list, confirm the blocks are all there, forget to put it back.
# The menu still opens, still inserts the right block, still removes the
# `/query` — nine checks green and one saying the menu ignores what was typed.
#
# Reddens: comment-slash-commands: "and what follows the slash narrows it to Quote — the blocks that do not match are gone"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """            {matchBlocks(COMPOSER_BLOCKS, commentSlashQuery, t).length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-muted-foreground">
                {t('taskDetail.slashNoMatch')}
              </div>
            ) : (
              matchBlocks(COMPOSER_BLOCKS, commentSlashQuery, t).map((block) => (
"""
b = """            {matchBlocks(COMPOSER_BLOCKS, '', t).length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-muted-foreground">
                {t('taskDetail.slashNoMatch')}
              </div>
            ) : (
              matchBlocks(COMPOSER_BLOCKS, '', t).map((block) => (
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the comment slash menu ignores what was typed after the slash.')
