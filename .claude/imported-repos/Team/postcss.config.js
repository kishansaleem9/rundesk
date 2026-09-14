// Local PostCSS config for the Next app. This prevents the parent repo's
// Tailwind PostCSS config from being picked up via directory walk-up.
// The app uses hand-written CSS (app/globals.css), so no plugins are needed.
module.exports = { plugins: {} };
