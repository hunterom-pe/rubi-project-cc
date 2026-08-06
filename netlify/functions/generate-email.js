const Anthropic = require("@anthropic-ai/sdk");

const LENGTH_INSTRUCTIONS = {
  short:
    "SHORT: 3-4 sentences total. State the denial and the core reason clearly. No extra sections.",
  medium:
    "MEDIUM: A few short paragraphs — a brief acknowledgment of the claim, a clear explanation of the denial reason, and next steps.",
  long:
    "LONG: A fuller email with a warm acknowledgment of the claim, a detailed explanation of the denial that references specifics from the pasted claim, information on next steps or how to appeal, and a proper closing.",
};

function buildPrompt(claim, reason, length) {
  const lengthKey = ["short", "medium", "long"].includes(length) ? length : "medium";
  const lengthInstruction = LENGTH_INSTRUCTIONS[lengthKey];

  return `You are helping a property management employee write a professional warranty claim denial email to a tenant/customer.

Customer's original warranty claim:
"""
${claim}
"""

Reason the claim is being denied (informal notes from the employee):
"""
${reason}
"""

Write a professional, empathetic, but clear denial email. Tone: polite, firm, and non-defensive — do not over-apologize, do not use heavy legalese, and do not be dismissive of the customer's concern.

Length requirement: ${lengthInstruction}

Sign the email off with generic placeholders the employee will fill in herself, such as "[Your Name]" and "[Property Management Company]" — do not invent a real name or company.

Respond with ONLY a raw JSON object (no markdown fences, no commentary) in exactly this shape:
{"subject": "<email subject line>", "body": "<full email body, using \\n for line breaks between paragraphs>"}`;
}

function extractJson(text) {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in model response");
  }
  return JSON.parse(trimmed.slice(start, end + 1));
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

  const { claim, reason, length } = payload;

  if (!claim || !reason || typeof claim !== "string" || typeof reason !== "string") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Both 'claim' and 'reason' are required strings" }),
    };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is not configured correctly" }),
    };
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: buildPrompt(claim, reason, length),
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock) {
      throw new Error("No text content in model response");
    }

    const { subject, body } = extractJson(textBlock.text);

    if (!subject || !body) {
      throw new Error("Model response missing subject or body");
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body }),
    };
  } catch (err) {
    console.error("generate-email error:", err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Failed to generate email" }),
    };
  }
};
