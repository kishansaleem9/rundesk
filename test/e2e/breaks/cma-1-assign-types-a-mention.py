# Assign goes back to typing a mention into the composer.
#
# THE ORIGINAL DEFECT, RESTORED, and the suite names it so a regression is
# unmistakable: "Assign no longer just types a mention into the composer." The
# menu still opens, the list of people who can see the channel is still correct,
# the button is still disabled while a mutation is pending — everything about
# the control is right except what it does. Typing `<@id>` into the box is a
# plausible implementation of "assign" if you have never asked what happens
# next: the person is mentioned, they get a notification, somebody reads it.
#
# What it is not is an assignment. Nothing is stored against the message, so
# there is no chip, nothing in the assignee's own assigned list, nothing to
# resolve, and no record afterwards of who did it. A mention is a message about
# work; an assignment is a claim on it.
#
# SIX CHECKS, AND THE SHAPE OF THE SET IS THE POINT. The chip is absent, the
# chip's words are absent, the composer is no longer what it was, the assignee's
# list does not hold it, and resolving has nothing to take off — so the three
# checks that read the SERVER fall alongside the three that read the screen.
# "Assign opens a list of people who can see the channel" still passes,
# correctly: the menu is not what broke.
#
# PREDICTED FIVE AND IT IS SIX, and the sixth is this patch's own doing to the
# suite rather than a miscount of the code. The resolve click used to be
# unconditional, so this patch threw inside it and ended the run on
# `12 passed, 5 failed` with fifty-six checks unrun; the fix put both resolve
# checks behind a `chain`, which reports the pair as FAILED with the reason —
# `skipped: there was no assignment chip to resolve` — instead of leaving them
# off the total. So the run that found the harness defect reported five, and the
# run against the repaired suite reports six: the same damage, counted honestly.
#
# `the resolved assignment stays on the message` is the one worth watching: it
# is the check that says an assignment is a record rather than a state, and with
# nothing ever recorded there is nothing to keep.
#
# Reddens: chat-message-actions: "the message now shows who it is assigned to"
#   and "the chip says \"Assigned to …\"" and
#   "Assign no longer just types a mention into the composer" and
#   "the assignee sees it in their own assigned list" and
#   "resolving takes it off the assignee’s list" and
#   "the resolved assignment stays on the message"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = """                                          onClick={() =>
                                            already
                                              ? unassignMessageMutation.mutate({ messageId: m.id, assigneeId: person.userId })
                                              : assignMessageMutation.mutate({ messageId: m.id, assigneeId: person.userId })
                                          }
"""
b = """                                          onClick={() =>
                                            setInput(
                                              (prev) => `${prev}${prev ? ' ' : ''}<@${person.userId}>`,
                                            )
                                          }
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-chat-page.tsx: Assign types a mention instead of assigning.')
