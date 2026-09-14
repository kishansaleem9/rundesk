"use client";

import {
  EmojiPickerContent,
} from "./EmojiPicker";

export default function ReactionPicker({
  onSelect,
}: {
  onSelect: (
    emoji: string,
  ) => void;
}) {
  return (
    <section
      className="reaction-picker clickup-full-emoji-picker"
      role="dialog"
      aria-label="Choose a reaction"
      onClick={(event) =>
        event.stopPropagation()
      }
    >
      <EmojiPickerContent
        onSelect={onSelect}
      />
    </section>
  );
}
