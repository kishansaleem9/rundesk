# Ctrl+\ collapses the sidebar even when the caret is in a text field.
#
# The guard is four lines that read like defensive noise: the chord requires a
# modifier, and a modifier chord is not something you type by accident — so
# checking the event target looks like belt and braces over a condition already
# handled one line above. The comment above it says exactly why it is not, and
# the comment survives this patch.
#
# `\` is a character. Somebody pasting a Windows path into a task title, or
# typing one, holds Ctrl for the paste and hits backslash for the path, and the
# navigation disappears out from under them mid-sentence. The frame's whole
# complaint is about being interrupted mid-task — "jab hum kaam kar rahe hote
# hain to it's kind of frustrating" — and a shortcut that fires while you are
# writing is the same interruption wearing the fix's clothes.
#
# ONE CHECK IS WHAT IT SHOULD REDDEN, AND IT REDDENED EIGHT — because the
# check leaves the sidebar COLLAPSED and every section below it reads a sidebar
# that is not there. Five of the eight were about favourites and the space
# tree, and five more checks never ran at all: `43 passed, 8 failed`, `✗ only
# 51 of 56 checks ran`.
#
# Seven of those eight are the suite's state, not the patch's damage. A check
# that changes a persisted global preference and leaves it changed cascades
# into everything after it, and that is a defect in the section rather than in
# this patch — the section now puts the sidebar back through the same store the
# UI uses and reloads before moving on.
#
# The one it is aimed at is the half of a keyboard shortcut nobody tests: the
# two checks before it, that the chord collapses and expands, still pass,
# because the chord itself is untouched. This breaks only where it must not
# fire.
#
# Reddens: panel-collapse: "typing a backslash does NOT collapse the sidebar out from under you"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = """      if (event.key !== '\\\\' || !(event.metaKey || event.ctrlKey)) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
"""
b = """      if (event.key !== '\\\\' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the collapse chord no longer stands down while typing.')
