/**
 * §V2-07 — "Date format" and "Time format" in the export panel.
 *
 * Frame `10:58` shows both, as selects reading `Normal ▾`. She never opens
 * either one, so the video says what the DEFAULT is called and nothing about
 * what else is in the list. The option set below is therefore Rundesk's
 * choice, not a reading of the frame — the frame is the reason the controls
 * exist and the reason the default is called Normal.
 *
 * What the choice is FOR is the part that is not a guess. `2026-08-07` and
 * `08/07/2026` and `07/08/2026` are the same day, and the last two disagree
 * about which is the month. A spreadsheet opened in a different locale will
 * reinterpret an ambiguous date column silently — so the person exporting has
 * to be able to say which one they meant.
 *
 * EVERYTHING IS RENDERED IN UTC. The alternative is the server's timezone,
 * which is a property of where the API happens to run and would make the same
 * export differ between two deployments of the same product. UTC is stated in
 * the panel rather than assumed.
 */
export declare const DATE_FORMATS: readonly ["normal", "iso", "us", "eu"];
export declare const TIME_FORMATS: readonly ["normal", "h24", "none"];
export type DateFormat = (typeof DATE_FORMATS)[number];
export type TimeFormat = (typeof TIME_FORMATS)[number];
export declare function asDateFormat(value: unknown): DateFormat;
export declare function asTimeFormat(value: unknown): TimeFormat;
/**
 * `null` for a date that is not set, so the cell is empty rather than carrying
 * the word "null" or the epoch — both of which a spreadsheet would happily sort
 * as if they were real dates.
 */
export declare function formatDate(value: unknown, dateFormat: DateFormat, timeFormat: TimeFormat): string | null;
