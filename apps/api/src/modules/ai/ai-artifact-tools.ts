import type Anthropic from '@anthropic-ai/sdk'

/**
 * BRAIN MAKES A DECK WHEN IT IS ASKED FOR ONE (`ledger-rows/row-853`, frame
 * `16:50`): asked "What's new in Brain²?", it answers with prose and an embedded
 * deck — "I made you a quick overview. 4 slides." — that opens as slides. The
 * model decides, as ClickUp's Brain decides, by calling this tool; the deck is
 * checked as a typed one would be (`parseDeck`) and kept as the asker's own
 * Artifact, and the panel is told on the wire what was made.
 */
export const DECK_TOOL_NAME = 'create_slide_deck'

export const DECK_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: DECK_TOOL_NAME,
    description:
      'Make a slide deck for the person asking — an overview, a brief, a plan, a status update — when they ask for slides, a deck or a presentation, or when an overview reads best as slides. It is kept as their own artifact, shown as a card they open and page through, ask you to change, and publish.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The deck’s title, at most 120 characters' },
        slides: {
          type: 'array',
          description: 'One to fifteen slides, in order',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'The slide’s heading' },
              bullets: { type: 'array', items: { type: 'string' }, description: 'At most eight short points' },
              notes: { type: 'string', description: 'Speaker notes, optional' },
            },
            required: ['title', 'bullets'],
          },
        },
      },
      required: ['title', 'slides'],
    },
  },
]

export const DECK_TOOL_INSTRUCTION = `When the person asks for slides, a deck or a presentation — or an overview that reads best as slides — make it with ${DECK_TOOL_NAME}: two to ten slides, each a short title and a few points. Then say in one sentence what you made, as "I made you a quick overview. 4 slides."`
