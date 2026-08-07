const { GoogleGenAI } = require("@google/genai");

const MODEL = "gemini-3.6-flash";
const MAX_ITEMS = 200;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summaries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          itemNumber: { type: "string" },
          summary: { type: "string" },
        },
        required: ["itemNumber", "summary"],
      },
    },
  },
  required: ["summaries"],
};

function buildPrompt(items) {
  const listing = items
    .map((it, i) => `${i + 1}. [itemNumber: ${it.itemNumber}] "${it.title}"\n${it.description}`)
    .join("\n\n");

  return `You are helping summarize a home inspection report into a client-facing document. Below is a list of defect items found during the inspection, each with its item number, title, and the inspector's raw description/notes.

For EACH item, write a 1-2 sentence plain-English summary a homeowner could quickly understand — what the issue is and, briefly, why it matters. Do not invent details not present in the source text. Keep the inspector's factual findings, just make them clear and concise. Do not include severity labels, item numbers, or headings in the summary text itself — just the plain-English explanation.

Items:
${listing}

Respond with one summary per item, matched by itemNumber, covering every item listed above.`;
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

  const { items } = payload;

  if (!Array.isArray(items) || items.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "'items' must be a non-empty array" }),
    };
  }

  if (items.length > MAX_ITEMS) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Too many items (max ${MAX_ITEMS})` }),
    };
  }

  for (const it of items) {
    if (!it || typeof it.itemNumber !== "string" || typeof it.title !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Each item requires itemNumber and title strings" }),
      };
    }
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
      contents: buildPrompt(
        items.map((it) => ({
          itemNumber: it.itemNumber,
          title: it.title,
          description: (it.description || "").slice(0, 2000),
        }))
      ),
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 8192,
      },
    });

    const parsed = JSON.parse(response.text);
    const summaryMap = new Map();
    for (const entry of parsed.summaries || []) {
      if (entry && entry.itemNumber && entry.summary) {
        summaryMap.set(entry.itemNumber, entry.summary);
      }
    }

    const summaries = items.map((it) => ({
      itemNumber: it.itemNumber,
      summary: summaryMap.get(it.itemNumber) || it.description || it.title,
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summaries }),
    };
  } catch (err) {
    console.error("summarize-defects error:", err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Failed to summarize defects" }),
    };
  }
};
