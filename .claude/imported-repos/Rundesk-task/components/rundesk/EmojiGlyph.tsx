"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

export type SkinTone =
  | ""
  | "🏻"
  | "🏼"
  | "🏽"
  | "🏾"
  | "🏿";

export const SKIN_TONES: Array<{
  value: SkinTone;
  label: string;
}> = [
  { value: "", label: "Default" },
  { value: "🏻", label: "Light" },
  { value: "🏼", label: "Medium-light" },
  { value: "🏽", label: "Medium" },
  { value: "🏾", label: "Medium-dark" },
  { value: "🏿", label: "Dark" },
];

const SKIN_TONE_KEY =
  "rundesk:emoji-skin-tone";

const SKIN_TONE_EVENT =
  "rundesk:emoji-skin-tone-changed";

const skinTonePattern =
  /[\u{1F3FB}-\u{1F3FF}]/gu;

const TONEABLE_EMOJIS =
  new Set([
    "👍",
    "👎",
    "👏",
    "🙌",
    "🙏",
    "👋",
    "👌",
    "✌",
    "🤞",
    "🤟",
    "🤘",
    "🤙",
    "💪",
    "👊",
    "✊",
    "🤛",
    "🤜",
    "☝",
    "👆",
    "👇",
    "👉",
    "👈",
    "🖐",
    "✋",
    "🤚",
    "🫶",
    "🤲",
    "👐",
    "🙋",
    "🙆",
    "🙅",
    "🤷",
    "🤦",
    "🙇",
    "💁",
  ]);

function canonicalEmoji(
  emoji: string,
) {
  return emoji
    .replace(
      skinTonePattern,
      "",
    )
    .replaceAll(
      "\uFE0F",
      "",
    );
}

export function isToneableEmoji(
  emoji: string,
) {
  return TONEABLE_EMOJIS.has(
    canonicalEmoji(emoji),
  );
}

export function applySkinTone(
  emoji: string,
  tone: SkinTone,
) {
  const withoutTone =
    emoji.replace(
      skinTonePattern,
      "",
    );

  if (
    !tone ||
    !isToneableEmoji(
      withoutTone,
    )
  ) {
    return withoutTone;
  }

  const variationIndex =
    withoutTone.indexOf(
      "\uFE0F",
    );

  if (
    variationIndex >= 0
  ) {
    return (
      withoutTone.slice(
        0,
        variationIndex,
      ) +
      tone +
      withoutTone.slice(
        variationIndex,
      )
    );
  }

  return `${withoutTone}${tone}`;
}

function isSkinTone(
  value: string | null,
): value is SkinTone {
  return (
    value === "" ||
    value === "🏻" ||
    value === "🏼" ||
    value === "🏽" ||
    value === "🏾" ||
    value === "🏿"
  );
}

export function useEmojiSkinTone() {
  const [skinTone, setSkinTone] =
    useState<SkinTone>("");

  useEffect(() => {
    const stored =
      localStorage.getItem(
        SKIN_TONE_KEY,
      );

    if (
      isSkinTone(stored)
    ) {
      setSkinTone(stored);
    }

    const changed = (
      event: Event,
    ) => {
      const next =
        (
          event as CustomEvent<
            SkinTone
          >
        ).detail;

      if (
        isSkinTone(next)
      ) {
        setSkinTone(next);
      }
    };

    window.addEventListener(
      SKIN_TONE_EVENT,
      changed,
    );

    return () =>
      window.removeEventListener(
        SKIN_TONE_EVENT,
        changed,
      );
  }, []);

  const updateSkinTone =
    useCallback(
      (
        next: SkinTone,
      ) => {
        setSkinTone(next);

        localStorage.setItem(
          SKIN_TONE_KEY,
          next,
        );

        window.dispatchEvent(
          new CustomEvent(
            SKIN_TONE_EVENT,
            {
              detail: next,
            },
          ),
        );
      },
      [],
    );

  return [
    skinTone,
    updateSkinTone,
  ] as const;
}

/*
 * IMPORTANT:
 * We intentionally use the browser / operating-system color emoji font here.
 *
 * The previous version used Twemoji SVGs. Twemoji draws 👍 with a blue cuff,
 * which is the blue block you were seeing in the toolbar.
 *
 * ClickUp in your reference screenshot is using the native Windows/browser
 * emoji appearance, so Rundesk now does the same.
 */
export default function EmojiGlyph({
  emoji,
  size = 18,
  className = "",
  title,
}: {
  emoji: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={[
        "emoji-glyph",
        "emoji-glyph-native",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: size,
        height: size,
        fontSize: size,
      }}
      title={title}
      aria-hidden="true"
    >
      {emoji}
    </span>
  );
}
