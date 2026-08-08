const { GoogleGenAI } = require("@google/genai");

const MODEL = "gemini-3.6-flash";
const MAX_TEXT_LENGTH = 20000;

function buildPrompt(text) {
  return `You are helping a property management employee polish something they've written — could be part of an email, a note, or a short message to a tenant, coworker, or vendor.

Rewrite the following text to sound more professional and polished: fix grammar, awkward phrasing, and tone, while keeping the original meaning, facts, and intent intact. If the original reads as a dense wall of text, break it into reasonable paragraphs. Do not invent new information or add content that wasn't implied by the original. Do not add a greeting, sign-off, or subject line unless the original already had one — just polish what's there.

Original text:
"""
${text}
"""

Respond with ONLY the rewritten text — no commentary, no explanation, and no quotation marks wrapping it.`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const { text } = payload;

  if (!text || typeof text !== "string" || !text.trim()) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "'text' is required" }),
    };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Text is too long (max ${MAX_TEXT_LENGTH} characters)` }),
    };
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is not configured correctly" }),
    };
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: buildPrompt(text),
    });

    const rewritten = (response.text || "").trim();
    if (!rewritten) {
      throw new Error("Empty response from model");
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rewritten }),
    };
  } catch (err) {
    console.error("rewrite-text error:", err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Failed to rewrite text" }),
    };
  }
};
