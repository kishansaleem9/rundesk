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
# PREDICTED ONE, REDDENED EIGHT, AND REDDENS ONE — the prediction was right and
# the suite was leaking state.
#
# The check leaves the sidebar COLLAPSED, and every section below it then read a
# sidebar that was not there: `43 passed, 8 failed`, `✗ only 51 of 56 checks
# ran`. Five of the eight were about favourites and the space tree, and five
# more checks never ran at all. A check that changes a persisted global
# preference and leaves it changed cascades into everything after it.
#
# The first attempt at the reset was wrong in a way worth keeping: it wrote
# `collapsed: false` into localStorage and reloaded, and the collapse is
# persisted on the ACCOUNT as well, so the reload re-hydrated it from the server
# and the cascade survived the fix. It presses the chord until the sidebar
# reports itself expanded now, which goes through the same store, the same PATCH
# and the same hydration as everything else. `55 passed, 1 failed`.
#
# The one it is aimed at is the half of a keyboard shortcut nobody tests: the
# two checks before it, that the chord collapses and expands, still pass,
# because the chord itself is untouched. This breaks only where it must not
# fire.
#
# Reddens: panel-collapse: ") // Ctrl rather than Meta: the handler accepts either, and Meta is not the // modifier on the platform CI runs on. await page.keyboard.press('Control+\\') const collapsedByKey = await settlesTo('true') check(collapsedByKey, 'Ctrl+\\ collapses it without reaching for the mouse', 'the chord did nothing') /* * Everything below asks whether a state CHANGED, so it can only be asked * once a change has happened. Run unconditionally, both of these go green on * a build where the chord is not wired at all — the sidebar never left * expanded, so \"it came back\" and \"it did not collapse while typing\" are * both true and both meaningless. Said as failures with the reason attached * rather than skipped, because the behaviour really is broken. */ if (!collapsedByKey) { check(false, 'and pressing it again brings it back', 'never collapsed, so expanding could not be tested') check(false, 'with the caret in a text field', 'the chord does nothing, so the typing guard is untestable') check(false, 'typing a backslash does NOT collapse the sidebar out from under you', 'the chord does nothing at all') } else { await page.keyboard.press('Control+\\') check(await settlesTo('false'), 'and pressing it again brings it back', 'the chord collapsed but could not expand') // Now the guard: the same chord, with the caret in a text field. Asserted // against the expanded state re-established above, so \"it did not move\" // means the guard held rather than that nothing was listening. const composer = page.locator('textarea, [contenteditable=\"true\"], input[type=\"text\"]').first() if ((await composer.count()) === 0) { check(false, 'with the caret in a text field', 'no text field on this page to test the guard against') check(false, 'typing a backslash does NOT collapse the sidebar out from under you', 'nowhere to type') } else { await composer.click({ timeout: 5000 }).catch(() => {}) const focused = await page.evaluate(() => { const el = document.activeElement return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) }) check(focused, 'with the caret in a text field', 'could not focus a text field, so the guard was never exercised') await page.keyboard.press('Control+\\') await page.waitForTimeout(1200) check( (await sidebarState()) === 'false', 'typing a backslash does NOT collapse the sidebar out from under you', 'the sidebar collapsed while somebody was typing', ) } } /* * PUT IT BACK. A CHECK THAT CHANGES GLOBAL STATE AND LEAVES IT CHANGED * CASCADES INTO EVERY SECTION AFTER IT. * *"
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
