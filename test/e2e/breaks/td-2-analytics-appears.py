# A FIFTH TAB JOINS THE TEAMS PAGE, with nothing behind it.
#
# The frame lists four destinations — All Teams, All People, Org Chart and
# Analytics — and the page offers those four since Analytics was built as
# ClickUp's (8 October, `ledger-rows/section3-team-analytics`). This adds a
# fifth, dead one: the page then offers what the frame does not, a tab whose
# purpose somebody has to guess.
#
# Written as a separate button beside the map, not a fifth entry in its `as
# const` array, which narrows `x.id` past what `setTab` accepts (TS2345 — the
# as-const trap that cost this patch's first version, 25 September).
#
# Re-aimed 8 October: it added the then-absent Analytics tab, and the check
# that named it asserted three; Analytics is the fourth now, and the dead tab
# is a fifth.
# Reddens: teams-destination: "there are the frame’s four destinations: All Teams, All People, Org chart and Analytics"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
a = """          </button>
        ))}
      </div>
"""
b = """          </button>
        ))}
        <button
          type="button"
          data-testid="teams-tab-pulse"
          onClick={() => {}}
          className="flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Network className="h-3.5 w-3.5" />
          Pulse
        </button>
      </div>
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-teams-page.tsx: a dead fifth tab now sits beside the four real ones.')
