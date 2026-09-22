# High contrast stops changing the colour that fails first.
#
# `--muted-foreground` is the one token the mode exists for, and its own comment
# says so: "Muted text is where contrast fails first, so it stops being muted."
# This removes that line from both the light and the dark block and leaves the
# other twenty-two alone, so the mode still does something — the foreground goes
# to pure black or pure white, borders darken, focus rings thicken. The class is
# still applied, the toggle still reports its state, the choice still persists.
#
# The plausible route is not a deletion but a merge: `--muted-foreground` is the
# only token in the block that is NOT at an extreme (15% rather than 0%, 88%
# rather than 100%), so it reads as an inconsistency somebody tidies by removing
# it and letting the base value stand.
#
# A person who needs the mode gets a screen where everything except the
# secondary text is high contrast — and secondary text is most of a settings
# page.
#
# TWO CHECKS, AND THE SUITE'S COMMENT NAMES THE TRAP THEY EXIST FOR: "A toggle
# that stores a boolean and changes no colour is not an accessibility mode." It
# reads the RESOLVED token off the document, not the class, which is the only
# way this is visible — `switching it on marks the document` still passes,
# because the document really is marked.
#
# Reddens: settings-depth: "and muted text actually changes colour" and
#   "to something near black or near white, not another grey"
import io
p = '/home/user/rundesk/packages/ui/src/styles.css'
light = """    /* Muted text is where contrast fails first, so it stops being muted. */
    --muted-foreground: 0 0% 15%;
"""
dark = """    --secondary-foreground: 0 0% 100%;
    --muted-foreground: 0 0% 88%;
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(light) == 1, f'light anchor appears {s.count(light)} times in {p}, expected exactly 1'
assert s.count(dark) == 1, f'dark anchor appears {s.count(dark)} times in {p}, expected exactly 1'
s = s.replace(light, '')
s = s.replace(dark, '    --secondary-foreground: 0 0% 100%;\n')
io.open(p, 'w', encoding='utf-8').write(s)
print('styles.css: high contrast no longer touches muted text.')
