# THE COMMENT "+" MENU HAS NO BRAIN AGAIN.
#
# Nine of the frame's ten items, which is where the menu stood for a month on
# a reason that had gone stale: "the Brain² hub does not exist", while the
# panel Brain opens stood one keystroke away. The space bar still opens it, so
# nothing is broken in the sense a person would report; the frame's entry
# point to it is simply gone.
#
# RE-AIMED 29 September (`found-29-sep/brain-loses-early-typing`): the row
# now only records the choice and the menu opens the panel once it has
# closed, so the block it removes reads differently. It removes the same row.
#
# Reddens: brain-entry-points: "the comment “+” menu offers Brain, beside Add emoji where frame `04:50` draws it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """          {/*
            Brain, beside Add emoji where frame `04:50` draws it
            (`ledger-rows/row-751`): the panel the space bar opens, through the
            same opener, once this menu has closed (see above).
          */}
          <DropdownMenuItem
            data-testid="comment-plus-brain"
            onSelect={() => {
              brainChosen.current = true
            }}
          >
            <BrainIcon className="mr-2 h-4 w-4" />
            {t('commentPlus.brain')}
          </DropdownMenuItem>
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the comment "+" menu no longer offers Brain.')
