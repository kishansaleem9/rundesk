# A surface answers a wait with the word "Loading" again.
#
# `PageSkeleton` already carries an sr-only "Loading…" for screen readers, which
# is correct and stays. This adds a VISIBLE line above the shapes, taken from
# the locale catalogue — which is the plausible shape of the regression, because
# it looks like an accessibility and i18n improvement at once: the wait now says
# what it is, in the reader's language, instead of only announcing itself to
# assistive tech.
#
# It is the thing the 7 Aug note is about. 79 surfaces answered a wait with a
# line of grey text, and every one of them was individually defensible; the
# blanket guard exists because the defect is a habit rather than a bug. One
# reference to `common.loading` from anywhere under `apps/web/src` is enough to
# put a visible "Loading…" back in front of somebody, and the check is absolute
# for that reason.
#
# Predicted one and it is one: nothing else in the suite reads source, and the
# shapes are still drawn, so every visual check is unaffected. This is the only
# check in the suite that is not about a screen.
#
# Reddens: loading-states: "no visible \"Loading…\" copy is wired to a surface"
import io
p = '/home/user/rundesk/apps/web/src/components/loading-skeletons.tsx'
a = """    <div className="p-6 space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
"""
b = """    <div className="p-6 space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <p className="text-[13px] text-muted-foreground">{t('common.loading')}</p>
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)

# The hook it needs. Added at the top of the component, where the other
# components in this file would take it.
sig = """export function PageSkeleton({
  children,
  toolbar = true,
}: {
  children?: React.ReactNode
  toolbar?: boolean
}) {
  return (
"""
new_sig = """export function PageSkeleton({
  children,
  toolbar = true,
}: {
  children?: React.ReactNode
  toolbar?: boolean
}) {
  const { t } = useTranslation()
  return (
"""
assert s.count(sig) == 1, f'signature anchor appears {s.count(sig)} times in {p}, expected exactly 1'
s = s.replace(sig, new_sig)

imp = "import { useSidebarStore } from '../store/sidebar'\n"
assert s.count(imp) == 1, f'import anchor appears {s.count(imp)} times in {p}, expected exactly 1'
s = s.replace(imp, imp + "import { useTranslation } from '../lib/i18n'\n")
io.open(p, 'w', encoding='utf-8').write(s)
print('loading-skeletons.tsx: PageSkeleton renders a visible "Loading…" line.')
