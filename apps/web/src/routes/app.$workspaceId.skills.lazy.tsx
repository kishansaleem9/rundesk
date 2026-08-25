import { createLazyFileRoute, Outlet } from '@tanstack/react-router'

/**
 * §15 — a LAYOUT route, not the hub.
 *
 * Rendering the hub here directly is what made /skills/$skillId unreachable on
 * the 25 Aug deploy: a leaf route with no <Outlet> shadows its children, so the
 * detail page never mounted and navigating to a skill silently showed the hub
 * again. Exactly the fault this repo already fixed for Approvals, Sprint-detail
 * and Goal-detail — same shape, same cause. The hub lives in the index route.
 */
function SkillsSectionLayout() {
  return <Outlet />
}

export const Route = createLazyFileRoute('/app/$workspaceId/skills')({
  component: SkillsSectionLayout,
})
