# Warranty Denial Assistant 🏡💌

A small, cozy internal tool for a property management employee to turn a pasted warranty claim into a professional, empathetic denial email — styled like a pixel-art farm.

## What it does

1. Paste the customer's warranty claim into the first box.
2. Write a short, informal note on why it's being denied (e.g. "not covered under warranty terms, item is over 2 years old").
3. Pick a length: Short / Medium / Long.
4. Click **Write the Email** — a Netlify serverless function calls the Anthropic API (Claude) to draft a subject + body.
5. Click **Copy** to copy the full email to your clipboard, fill in your name/company, and send.

No claim or reason text is stored anywhere — it's sent to the function, used to generate the email, and discarded.

## Tech stack

- Plain HTML/CSS/JS static frontend (no build step, no framework)
- One Netlify serverless function (`netlify/functions/generate-email.js`) using `@anthropic-ai/sdk`
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

3. Copy `.env.example` to `.env` and add your Anthropic API key:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env`:

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

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
   - `ANTHROPIC_API_KEY` = your Anthropic API key
5. Deploy. The function will be available at `/.netlify/functions/generate-email`.

**Important:** the API key must be set in Netlify's environment variables for the function to work in production — it is never read from the client, and `.env` is git-ignored so it never gets committed.

## Project structure

```
.
├── index.html
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
