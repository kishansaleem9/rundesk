"use client";

import {
  Clock3,
  Flag,
  Gamepad2,
  Heart,
  Lightbulb,
  Plane,
  Search,
  Smile,
  Sparkles,
  Utensils,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";

import EmojiGlyph, {
  applySkinTone,
  isToneableEmoji,
  SKIN_TONES,
  useEmojiSkinTone,
} from "./EmojiGlyph";

type EmojiCategory =
  | "frequent"
  | "smileys"
  | "hands"
  | "objects"
  | "food"
  | "travel"
  | "activities"
  | "symbols"
  | "flags";

type EmojiEntry = {
  emoji: string;
  name: string;
  category:
    EmojiCategory;
};

const emojiEntries:
  EmojiEntry[] = [
  { emoji: "😀", name: "grinning smile happy", category: "smileys" },
  { emoji: "😃", name: "smile happy", category: "smileys" },
  { emoji: "😄", name: "smile laugh happy", category: "smileys" },
  { emoji: "😁", name: "grin happy", category: "smileys" },
  { emoji: "😆", name: "laughing squint", category: "smileys" },
  { emoji: "😅", name: "sweat smile", category: "smileys" },
  { emoji: "🤣", name: "rolling laugh", category: "smileys" },
  { emoji: "😂", name: "laugh tears joy", category: "smileys" },
  { emoji: "🙂", name: "slight smile", category: "smileys" },
  { emoji: "😊", name: "blush smile", category: "smileys" },
  { emoji: "😉", name: "wink", category: "smileys" },
  { emoji: "😍", name: "heart eyes love", category: "smileys" },
  { emoji: "🥰", name: "hearts love smile", category: "smileys" },
  { emoji: "😘", name: "kiss love", category: "smileys" },
  { emoji: "😗", name: "kiss", category: "smileys" },
  { emoji: "😙", name: "kiss smile", category: "smileys" },
  { emoji: "😚", name: "kiss closed eyes", category: "smileys" },
  { emoji: "😋", name: "yum tasty", category: "smileys" },
  { emoji: "😛", name: "tongue playful", category: "smileys" },
  { emoji: "😜", name: "wink tongue", category: "smileys" },
  { emoji: "🤪", name: "zany silly", category: "smileys" },
  { emoji: "😝", name: "tongue squint", category: "smileys" },
  { emoji: "🤑", name: "money face", category: "smileys" },
  { emoji: "🤗", name: "hug", category: "smileys" },
  { emoji: "🤭", name: "hand over mouth", category: "smileys" },
  { emoji: "🤫", name: "shush quiet", category: "smileys" },
  { emoji: "🤔", name: "thinking", category: "smileys" },
  { emoji: "🫡", name: "salute", category: "smileys" },
  { emoji: "🤩", name: "star eyes wow", category: "smileys" },
  { emoji: "🥳", name: "party celebrate", category: "smileys" },
  { emoji: "😎", name: "cool sunglasses", category: "smileys" },
  { emoji: "😮", name: "surprised wow", category: "smileys" },
  { emoji: "😢", name: "sad cry", category: "smileys" },
  { emoji: "😭", name: "cry tears", category: "smileys" },
  { emoji: "😱", name: "scream shocked", category: "smileys" },
  { emoji: "😴", name: "sleepy", category: "smileys" },
  { emoji: "🥺", name: "pleading", category: "smileys" },
  { emoji: "😇", name: "angel halo", category: "smileys" },
  { emoji: "🤓", name: "nerd glasses", category: "smileys" },
  { emoji: "🫠", name: "melting face", category: "smileys" },

  { emoji: "👍", name: "thumbs up like yes", category: "hands" },
  { emoji: "👎", name: "thumbs down dislike no", category: "hands" },
  { emoji: "👏", name: "clap applause", category: "hands" },
  { emoji: "🙌", name: "raised hands hooray", category: "hands" },
  { emoji: "🙏", name: "pray thanks please", category: "hands" },
  { emoji: "👋", name: "wave hello goodbye", category: "hands" },
  { emoji: "👌", name: "ok hand", category: "hands" },
  { emoji: "✌️", name: "peace victory", category: "hands" },
  { emoji: "🤞", name: "fingers crossed luck", category: "hands" },
  { emoji: "🤟", name: "love you hand", category: "hands" },
  { emoji: "🤘", name: "rock hand", category: "hands" },
  { emoji: "🤙", name: "call me hand", category: "hands" },
  { emoji: "💪", name: "strong muscle", category: "hands" },
  { emoji: "👊", name: "fist bump", category: "hands" },
  { emoji: "✊", name: "raised fist", category: "hands" },
  { emoji: "🤛", name: "left fist", category: "hands" },
  { emoji: "🤜", name: "right fist", category: "hands" },
  { emoji: "✋", name: "raised hand stop", category: "hands" },
  { emoji: "🖐️", name: "open hand", category: "hands" },
  { emoji: "🫶", name: "heart hands love", category: "hands" },

  { emoji: "💡", name: "idea light bulb", category: "objects" },
  { emoji: "📌", name: "pin", category: "objects" },
  { emoji: "📎", name: "paperclip attachment", category: "objects" },
  { emoji: "📅", name: "calendar", category: "objects" },
  { emoji: "📝", name: "memo note", category: "objects" },
  { emoji: "💻", name: "laptop computer", category: "objects" },
  { emoji: "📱", name: "phone mobile", category: "objects" },
  { emoji: "🔔", name: "bell notification", category: "objects" },
  { emoji: "🔒", name: "lock secure", category: "objects" },
  { emoji: "🔑", name: "key", category: "objects" },

  { emoji: "☕", name: "coffee", category: "food" },
  { emoji: "🍕", name: "pizza", category: "food" },
  { emoji: "🍔", name: "burger", category: "food" },
  { emoji: "🍟", name: "fries", category: "food" },
  { emoji: "🍩", name: "donut", category: "food" },
  { emoji: "🍰", name: "cake", category: "food" },
  { emoji: "🍎", name: "apple", category: "food" },
  { emoji: "🍓", name: "strawberry", category: "food" },
  { emoji: "🍉", name: "watermelon", category: "food" },
  { emoji: "🍿", name: "popcorn", category: "food" },

  { emoji: "🚀", name: "rocket launch", category: "travel" },
  { emoji: "✈️", name: "airplane travel", category: "travel" },
  { emoji: "🚗", name: "car", category: "travel" },
  { emoji: "🚲", name: "bike bicycle", category: "travel" },
  { emoji: "🏠", name: "house home", category: "travel" },
  { emoji: "🌍", name: "earth world", category: "travel" },
  { emoji: "🌙", name: "moon", category: "travel" },
  { emoji: "☀️", name: "sun", category: "travel" },

  { emoji: "🎉", name: "party celebration", category: "activities" },
  { emoji: "🎯", name: "target goal", category: "activities" },
  { emoji: "🏆", name: "trophy win", category: "activities" },
  { emoji: "⚽", name: "football soccer", category: "activities" },
  { emoji: "🏀", name: "basketball", category: "activities" },
  { emoji: "🎮", name: "game controller", category: "activities" },
  { emoji: "🎵", name: "music note", category: "activities" },
  { emoji: "🎬", name: "movie film", category: "activities" },

  { emoji: "❤️", name: "red heart love", category: "symbols" },
  { emoji: "🧡", name: "orange heart", category: "symbols" },
  { emoji: "💛", name: "yellow heart", category: "symbols" },
  { emoji: "💚", name: "green heart", category: "symbols" },
  { emoji: "💙", name: "blue heart", category: "symbols" },
  { emoji: "💜", name: "purple heart", category: "symbols" },
  { emoji: "🔥", name: "fire hot", category: "symbols" },
  { emoji: "✅", name: "check done complete", category: "symbols" },
  { emoji: "❌", name: "cross no", category: "symbols" },
  { emoji: "👀", name: "eyes watching", category: "symbols" },
  { emoji: "⭐", name: "star favorite", category: "symbols" },
  { emoji: "✨", name: "sparkles magic", category: "symbols" },
  { emoji: "💯", name: "hundred perfect", category: "symbols" },
  { emoji: "❗", name: "exclamation important", category: "symbols" },
  { emoji: "❓", name: "question", category: "symbols" },

  { emoji: "🇵🇰", name: "pakistan flag", category: "flags" },
  { emoji: "🇩🇪", name: "germany flag", category: "flags" },
  { emoji: "🇺🇸", name: "united states flag", category: "flags" },
  { emoji: "🇬🇧", name: "united kingdom flag", category: "flags" },
  { emoji: "🇨🇳", name: "china flag", category: "flags" },
  { emoji: "🇰🇷", name: "korea flag", category: "flags" },
];

const frequent = [
  "🙌",
  "👍",
  "✅",
  "❤️",
  "😊",
  "😀",
  "😍",
  "😆",
  "👌",
  "🔥",
  "😘",
  "😜",
  "😁",
  "😂",
  "😱",
  "😢",
  "🥳",
  "👀",
  "🙏",
  "👏",
];

const tabs: Array<{
  id: EmojiCategory;
  label: string;
  icon: typeof Clock3;
}> = [
  { id: "frequent", label: "Frequently Used", icon: Clock3 },
  { id: "smileys", label: "Smiles & People", icon: Smile },
  { id: "hands", label: "People & Hands", icon: Sparkles },
  { id: "activities", label: "Activities", icon: Gamepad2 },
  { id: "food", label: "Food & Drink", icon: Utensils },
  { id: "travel", label: "Travel & Places", icon: Plane },
  { id: "objects", label: "Objects", icon: Lightbulb },
  { id: "symbols", label: "Symbols", icon: Heart },
  { id: "flags", label: "Flags", icon: Flag },
];

function getEntries(
  category: EmojiCategory,
) {
  if (
    category === "frequent"
  ) {
    return frequent
      .map((emoji) =>
        emojiEntries.find(
          (entry) =>
            entry.emoji === emoji,
        ),
      )
      .filter(
        (
          entry,
        ): entry is EmojiEntry =>
          Boolean(entry),
      );
  }

  return emojiEntries.filter(
    (entry) =>
      entry.category ===
      category,
  );
}

export function EmojiPickerContent({
  onSelect,
}: {
  onSelect: (
    emoji: string,
  ) => void;
}) {
  const [query, setQuery] =
    useState("");

  const [
    category,
    setCategory,
  ] =
    useState<EmojiCategory>(
      "frequent",
    );

  const [
    toneMenuOpen,
    setToneMenuOpen,
  ] = useState(false);

  const [
    skinTone,
    setSkinTone,
  ] = useEmojiSkinTone();

  const filtered =
    useMemo(() => {
      const trimmed =
        query
          .trim()
          .toLowerCase();

      if (trimmed) {
        return emojiEntries.filter(
          (entry) =>
            entry.name.includes(
              trimmed,
            ) ||
            entry.emoji.includes(
              trimmed,
            ),
        );
      }

      return getEntries(
        category,
      );
    }, [
      query,
      category,
    ]);

  function choose(
    emoji: string,
  ) {
    onSelect(
      isToneableEmoji(emoji)
        ? applySkinTone(
            emoji,
            skinTone,
          )
        : emoji,
    );
  }

  const title =
    query
      ? "Search Results"
      : tabs.find(
          (tab) =>
            tab.id ===
            category,
        )?.label ??
        "Emojis";

  return (
    <>
      <div className="emoji-picker-top">
        <label>
          <Search size={16} />

          <input
            value={query}
            onChange={(event) =>
              setQuery(
                event.target
                  .value,
              )
            }
            placeholder="Search..."
            autoFocus
          />
        </label>

        <div className="emoji-skin-tone-control">
          <button
            type="button"
            className="emoji-skin-tone-trigger"
            title="Choose skin tone"
            aria-label="Choose skin tone"
            onClick={() =>
              setToneMenuOpen(
                (current) =>
                  !current,
              )
            }
          >
            <EmojiGlyph
              emoji={applySkinTone(
                "✋",
                skinTone,
              )}
              size={19}
            />
          </button>

          {toneMenuOpen && (
            <div className="emoji-skin-tone-menu">
              {SKIN_TONES.map(
                ({
                  value,
                  label,
                }) => (
                  <button
                    type="button"
                    key={
                      value ||
                      "default"
                    }
                    className={
                      skinTone ===
                      value
                        ? "selected"
                        : ""
                    }
                    title={label}
                    onClick={() => {
                      setSkinTone(
                        value,
                      );

                      setToneMenuOpen(
                        false,
                      );
                    }}
                  >
                    <EmojiGlyph
                      emoji={applySkinTone(
                        "✋",
                        value,
                      )}
                      size={20}
                    />
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      </div>

      <div className="emoji-scroll-area">
        <div className="emoji-picker-title">
          {title}
        </div>

        <div className="emoji-grid clickup-emoji-grid">
          {filtered.map(
            ({
              emoji,
              name,
            }) => {
              const displayed =
                isToneableEmoji(
                  emoji,
                )
                  ? applySkinTone(
                      emoji,
                      skinTone,
                    )
                  : emoji;

              return (
                <button
                  type="button"
                  key={emoji}
                  title={name}
                  onClick={() =>
                    choose(emoji)
                  }
                >
                  <EmojiGlyph
                    emoji={
                      displayed
                    }
                    size={22}
                  />
                </button>
              );
            },
          )}

          {!filtered.length && (
            <p className="emoji-empty">
              No emojis found.
            </p>
          )}
        </div>

        {!query &&
          category ===
            "frequent" && (
            <>
              <div className="emoji-picker-title emoji-second-title">
                Smiles &amp; People
              </div>

              <div className="emoji-grid clickup-emoji-grid">
                {getEntries(
                  "smileys",
                )
                  .slice(0, 40)
                  .map(
                    ({
                      emoji,
                      name,
                    }) => (
                      <button
                        type="button"
                        key={`smile-${emoji}`}
                        title={name}
                        onClick={() =>
                          choose(
                            emoji,
                          )
                        }
                      >
                        <EmojiGlyph
                          emoji={
                            emoji
                          }
                          size={
                            22
                          }
                        />
                      </button>
                    ),
                  )}
              </div>
            </>
          )}
      </div>

      <footer className="emoji-category-footer">
        {tabs.map(
          ({
            id,
            label,
            icon: Icon,
          }) => (
            <button
              type="button"
              key={id}
              className={
                !query &&
                category === id
                  ? "active"
                  : ""
              }
              title={label}
              onClick={() => {
                setQuery("");
                setCategory(id);
              }}
            >
              <Icon size={15} />
            </button>
          ),
        )}
      </footer>
    </>
  );
}

export default function EmojiPicker({
  onSelect,
}: {
  onSelect: (
    emoji: string,
  ) => void;
}) {
  return (
    <section
      className="popover emoji-picker clickup-full-emoji-picker"
      role="dialog"
      aria-label="Choose an emoji"
    >
      <EmojiPickerContent
        onSelect={onSelect}
      />
    </section>
  );
}
