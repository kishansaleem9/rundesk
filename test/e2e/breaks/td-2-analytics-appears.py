# An Analytics tab joins the Teams page, with nothing behind it.
#
# The frame lists four destinations and this page offers three. The suite's
# header explains the fourth: "The frame lists Analytics; nothing exists behind
# it, and she never opens it — so a tab there would be a page whose purpose
# somebody has to guess. This suite fails if one shows up."
#
# So this is the same edit as `cpm-1-the-menu-grows-a-brain`, in a different
# file, for the same reason: a frame that lists four and a UI that shows three
# reads as an oversight, and the decision lives in a comment rather than in the
# code.
#
# WRITTEN AS A SEPARATE BUTTON, NOT AS A FOURTH ENTRY IN THE ARRAY — and the
# first version was the latter and BUILD FAILED. `TabId` is inferred from that
# `as const` array, so adding a member widens `x.id` past what `setTab`
# accepts: TS2345, "'analytics' is not assignable to SetStateAction<TabId>".
# That is the fourth time the as-const/literal-union narrowing trap has cost a
# patch in this repository, and the ledger records the other three. The tab is
# rendered beside the map instead: same fourth tab, same dead click, and the
# type of the three real ones is untouched.
#
# REDDENS TWO, AND THEY ARE THE PAIR THE SUITE BUILT FOR IT: the tab COUNT,
# which is three, and the page text, which must not say "analytics". Two
# assertions about one absence, because a count alone could be satisfied by
# dropping a real tab and a text match alone by a tab labelled something else.
#
# Everything else on the page is untouched — a member still gets in, the teams
# and people still list, My Teams still renders, the org chart still answers.
#
# Reddens: teams-destination: "there are exactly the three destinations that have something behind them"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
a = """            <x.icon className="h-3.5 w-3.5" />
            {t(x.labelKey)}
          </button>
        ))}
      </div>
"""
b = """            <x.icon className="h-3.5 w-3.5" />
            {t(x.labelKey)}
          </button>
        ))}
        <button
          type="button"
          data-testid="teams-tab-analytics"
          onClick={() => {}}
          className="flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Network className="h-3.5 w-3.5" />
          Analytics
        </button>
      </div>
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-teams-page.tsx: an Analytics tab now sits beside the three real ones.')
