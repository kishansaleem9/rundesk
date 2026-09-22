# The panel loses the block showing the message that was replied to.
#
# Its comment says what that costs: "Without it the answers are floating
# quotes." The Replies list shows you somebody's reply out of context — that
# is the whole reason it is a list of replies — and the panel exists to put
# the context back. Removing it leaves a reply count, a list of replies and a
# composer, with nothing saying what any of them are about.
#
# Cheap to lose, because `thread.data` is destructured into `{ parent,
# replies }` and `replies` is the one that looks like the content. A tidy-up
# that removes an "unused-looking" block takes the parent with it and leaves
# every other part of the panel working.
#
# ONE CHECK. The composer reads `thread.data.parent` rather than anything this
# block renders, so the answer still reaches the right thread and the page
# still stays on /replies — which is what makes "and shows the message being
# replied to" a check of its own rather than a restatement of the one after
# it.
#
# Reddens: replies-inline-thread: "and shows the message being replied to"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-replies-page.tsx'
a = """      <div
        className="rounded-md border-l-2 border-l-amber-400/70 bg-amber-400/5 px-2 py-1.5"
        data-testid="reply-thread-parent"
      >
        <div className="text-[11px] text-muted-foreground">{parent.authorName ?? ''}</div>
        <div className="whitespace-pre-wrap text-[13px] text-foreground">{parent.body}</div>
      </div>
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-replies-page.tsx: the thread panel no longer shows what is being replied to.')
