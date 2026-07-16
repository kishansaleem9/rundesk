import { createFileRoute } from '@tanstack/react-router'
import { DpaPage } from '../pages/dpa-page'

export const Route = createFileRoute('/dpa')({
  component: DpaPage,
})
