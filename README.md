# Warranty Denial Assistant 🏡💌

A small, cozy internal tool for a property management employee to turn a pasted warranty claim into a professional, empathetic denial email — styled like a pixel-art farm.

## What it does

1. Paste the customer's warranty claim into the first box.
2. Write a short, informal note on why it's being denied (e.g. "not covered under warranty terms, item is over 2 years old").
3. Pick a length: Short / Medium / Long.
4. Click **Write the Email** — a Netlify serverless function calls the Gemini API to draft a subject + body.
5. Click **Copy** to copy the full email to your clipboard, fill in your name/company, and send.

No claim or reason text is stored anywhere — it's sent to the function, used to generate the email, and discarded.

## Tech stack

- Plain HTML/CSS/JS static frontend (no build step, no framework)
- One Netlify serverless function (`netlify/functions/generate-email.js`) using `@google/genai` (Gemini API), model `gemini-3.6-flash`
- Deployed as a Netlify static site + function

## Running locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Install the Netlify CLI if you don't already have it:

   ```bash
   npm install -g netlify-cli
   ```

3. Copy `.env.example` to `.env` and add your Gemini API key:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env`:

   ```
   GEMINI_API_KEY=<paste your key here>
   ```

   Get a key from [Google AI Studio](https://aistudio.google.com/apikey) — click **Create API key** and paste whatever string it gives you.

4. Start the local dev server (serves the static site AND the function together):

   ```bash
   netlify dev
   ```

5. Open the printed local URL (typically `http://localhost:8888`).

## Deploying to Netlify

1. Push this repo to GitHub (already done if you're reading this from the deployed repo).
2. In Netlify, click **Add new site → Import an existing project**, and connect this GitHub repo.
3. Build settings are already defined in `netlify.toml`:
   - Publish directory: `.`
   - Functions directory: `netlify/functions`
   - No build command needed (static site).
4. Go to **Site settings → Environment variables** and add:
   - `GEMINI_API_KEY` = your Gemini API key
5. Deploy. The function will be available at `/.netlify/functions/generate-email`.

**Important:** the API key must be set in Netlify's environment variables for the function to work in production — it is never read from the client, and `.env` is git-ignored so it never gets committed.

## Favicon & link preview

`favicon.svg` is the source icon (a small pixel cottage + heart); `favicon-32x32.png`, `favicon-16x16.png`, and `apple-touch-icon.png` are pre-rendered fallbacks for browsers/devices that don't support SVG favicons. `og-image.png` (rendered from `og-image-source.svg`) is the card image used when the link is shared in iMessage, Slack, etc. — the `<meta property="og:*">` and `<meta name="twitter:*">` tags in `index.html` reference it by root-relative path, which resolves correctly once the site is deployed. If you add a custom domain, consider also adding an `og:url` meta tag with the canonical URL. Note that some apps (iMessage in particular) cache link previews, so a changed image may take a share or two to show up.

## Project structure

```
.
├── index.html
├── favicon.svg
├── favicon-32x32.png
├── favicon-16x16.png
├── apple-touch-icon.png
├── og-image.png
├── og-image-source.svg
├── css/style.css
├── js/app.js
├── netlify/
│   └── functions/
│       └── generate-email.js
├── netlify.toml
├── package.json
├── .env.example
└── .gitignore
```
