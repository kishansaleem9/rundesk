# "Set reminder" is promoted out of the overflow menu and onto the hover
# toolbar.
#
# THE DEFECT THIS WHOLE SECTION EXISTS TO PREVENT, arriving as an improvement.
# `[14:16]` is about a toolbar that showed twelve icons with the short menu
# hidden behind right-click, and the fix was to put the long tail in a `⋯`. A
# reminder is a common thing to want, and moving it one click closer is the
# obvious kindness — it just puts the thirteenth icon back on a bar that was
# already the complaint.
#
# The item is not deleted, and this is why it reads as safe: it still exists,
# still opens the same dialog, still pre-fills the same time, and the reminder
# it sets is still stored against the message with no invented task. Everything
# below the menu check passes, because the DIALOG is reached by a different
# route.
#
# ONE CHECK, AND IT IS THE ONE THAT NAMES WHERE THE THING LIVES rather than
# whether it works: `the overflow carries "Set reminder"`. The suite reads the
# menu's own text, so the check can tell an item that moved from an item that
# broke — and `the overflow carries the long tail (Forward, Pin)` still passes,
# because Forward and Pin did not move.
#
# The reminder section further down clicks `message-remind-` directly rather
# than going through the overflow, so it is unaffected. That is a weakness in
# those checks — they would pass with the item on any surface — and it is what
# makes this patch's single check the only thing standing between the toolbar
# and thirteen icons.
#
# Reddens: chat-message-actions: "the overflow carries \"Set reminder\""
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = """                                {/* §G11 [15:19] — "Set reminder", on the message
                                    itself. It used to be impossible: a reminder
                                    could only hang off a task. */}
                                <button
                                  type="button"
                                  data-testid={`message-remind-${m.id}`}
                                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                                  onClick={() => {
                                    setRemindDraft({ message: m, when: defaultReminderWhen(), note: '' })
                                    setOverflowFor(null)
                                  }}
                                >
                                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                  {t('chat.setReminder')}
                                </button>
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)

# …and onto the hover toolbar, beside the overflow trigger it used to hide in.
bar = """                          <span className="mx-0.5 h-4 w-px bg-border/70" />
                          <button
                            type="button"
                            data-testid={`message-overflow-${m.id}`}
"""
assert s.count(bar) == 1, f'toolbar anchor appears {s.count(bar)} times in {p}, expected exactly 1'
s = s.replace(
    bar,
    """                          <span className="mx-0.5 h-4 w-px bg-border/70" />
                          <button
                            type="button"
                            data-testid={`message-remind-${m.id}`}
                            title={t('chat.setReminder')}
                            className="h-[22px] w-[22px] rounded text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
                            onClick={() => setRemindDraft({ message: m, when: defaultReminderWhen(), note: '' })}
                          >
                            <Clock className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            data-testid={`message-overflow-${m.id}`}
"""
)
io.open(p, 'w', encoding='utf-8').write(s)
print('workspace-chat-page.tsx: Set reminder is a thirteenth toolbar icon, not a menu item.')
