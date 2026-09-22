# A person with no manager gets nothing where the reporting line should be.
#
# THE ABSENCE THAT LOOKS LIKE A LOADING STATE. Rendering nothing for a person
# with no manager is the shorter branch and the obvious one: there is no
# manager, so there is nothing to draw. The Reporting heading stays, the
# reports list below it stays, and on a person who HAS a manager the section is
# identical.
#
# What the reader cannot then tell is whether this person reports to nobody or
# whether the panel has not finished loading — and those are opposite answers.
# `[06:28]` puts reporting on the person because it is a question people ask
# about each other; a blank is the one response that does not answer it.
#
# The suite's sentence is exact about why: `"No manager" is rendered as an
# ANSWER, not left blank`. The check accepts either testid — the manager button
# or the no-manager line — so it passes for everybody who has one and fails
# only for the person who does not, which is the case this patch produces and
# the case the fixture is built around.
#
# One check. `the reporting line is a section on the person` still passes,
# because the section is still there; it is the contents that stopped saying
# anything.
#
# Reddens: person-panel: "\"No manager\" is rendered as an answer, not left blank"
import io
p = '/home/user/rundesk/apps/web/src/components/person-panel.tsx'
a = """            ) : (
              <p className="px-1.5 text-[12px] text-muted-foreground" data-testid="person-no-manager">
                {t('person.noManager')}
              </p>
            )}
"""
b = """            ) : null}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('person-panel.tsx: a person with no manager gets a blank where the answer was.')
