# Property Tools 🏡💌

A small, cozy internal tool for a property management employee, styled like a pixel-art farm. Three tabs:

1. **Denial Email** — turn a pasted warranty claim into a professional, empathetic denial email.
2. **Inspection Report Summary** — turn a 100+ page home inspection PDF into a downloadable Word summary of just the defects.
3. **Text Rewriter** — paste a rough paragraph or note and get a polished, professional rewrite.

## Denial Email tab

1. Paste the customer's warranty claim into the first box.
2. Write a short, informal note on why it's being denied (e.g. "not covered under warranty terms, item is over 2 years old").
3. Pick a length: Short / Medium / Long.
4. Click **Write the Email** — a Netlify serverless function calls the Gemini API to draft a subject + body.
5. Click **Copy** to copy the full email to your clipboard, fill in your name/company, and send.

No claim or reason text is stored anywhere — it's sent to the function, used to generate the email, and discarded.

## Inspection Report Summary tab

1. Upload a home inspection PDF (up to ~30MB, 100+ pages, hundreds of photos are fine).
2. The PDF is parsed **entirely in your browser** using `pdfjs-dist` — it never leaves your machine. The parser:
   - Reads the table of contents to map section numbers to category names.
   - Walks each page's text to find defect items (headings like `4.2.1 Paint & Caulking`), the report's own "Possible defect, contractor recommendation" divider, and the inline "Significant and/or Safety Concern" marker that promotes an item to **Red**. Everything else defaults to **Orange**.
   - Walks each page's embedded images (not full-page screenshots) to extract the real defect photos, filtering out small reused UI icons, and associates each photo with whichever item it falls under.
3. Only short text (item numbers, titles, description paragraphs — no images) is sent to a Netlify function that calls the Gemini API, batched across all items at once, to generate a 1–2 sentence plain-English summary per item.
4. A `.docx` is assembled **entirely in your browser** (via the `docx` package) — cover page, then a Red Defects section (grouped by category, with photos), then an Orange Defects section (grouped by category, text only) — and downloaded via `file-saver`.

Because the heuristics that find items/severity/photos are inherently a bit fuzzy against real-world PDF layout, treat the output as a strong first draft and skim it before sending.

## Text Rewriter tab

1. Paste a rough paragraph, note, or draft into the box.
2. Click **Rewrite** — a Netlify serverless function calls the Gemini API to polish the grammar, tone, and formatting while keeping the original meaning and facts intact. It won't invent content or add a greeting/sign-off that wasn't already there.
3. Edit the result if needed, then **Copy** it.

## Tech stack

- Plain HTML/CSS/JS static frontend (no build step, no framework) — the Inspection Report tab's heavier libraries (`pdfjs-dist`, `docx`, `file-saver`) are loaded via CDN ES module imports rather than an npm bundler, keeping the "no build step" setup intact.
- Three Netlify serverless functions, all using `@google/genai` (Gemini API), model `gemini-3.6-flash`:
  - `netlify/functions/generate-email.js` — denial emails
  - `netlify/functions/summarize-defects.js` — batched inspection-item summaries
  - `netlify/functions/rewrite-text.js` — text rewriting
- Deployed as a Netlify static site + functions

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
5. Deploy. The functions will be available at `/.netlify/functions/generate-email`, `/.netlify/functions/summarize-defects`, and `/.netlify/functions/rewrite-text`.

**Important:** the API key must be set in Netlify's environment variables for all three functions to work in production — it is never read from the client, and `.env` is git-ignored so it never gets committed.

**Netlify function size limit:** the `summarize-defects` function only ever receives item numbers, titles, and short description text — never the PDF or its photos — so it stays well under Netlify's request-size limits regardless of how large the source PDF is.

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
├── js/
│   ├── app.js                    # Denial Email tab logic
│   ├── tabs.js                   # tab switcher
│   ├── inspection-app.js         # Inspection Report tab logic (UI wiring)
│   ├── pdf-report-parser.js      # client-side PDF parsing (pdfjs-dist)
│   ├── docx-builder.js           # client-side .docx assembly (docx + file-saver)
│   └── rewrite-app.js            # Text Rewriter tab logic
├── netlify/
│   └── functions/
│       ├── generate-email.js
│       ├── summarize-defects.js
│       └── rewrite-text.js
├── netlify.toml
├── package.json
├── .env.example
└── .gitignore
```
