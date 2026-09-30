import { createLazyFileRoute } from '@tanstack/react-router'
import { ClipLinkPage } from '../pages/clip-link-page'

export const Route = createLazyFileRoute('/clips/$token')({
  component: ClipLinkPage,
})
