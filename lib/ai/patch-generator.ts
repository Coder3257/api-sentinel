/**
 * lib/ai/patch-generator.ts
 *
 * Given a set of Stripe OpenAPI breaking changes and the content of an
 * affected source file, calls Gemini API to produce a patched version of that
 * file plus a plain-English explanation of what was changed.
 *
 * Design:
 *  - One Gemini call per file (focused prompt → better patches).
 *  - Returns a structured result containing the patched content and reasoning.
 *  - Uses Gemini Structured Outputs (JSON Schema constraint) to ensure
 *    reliable formatting.
 *  - If Gemini fails or returns invalid output, returns the original content with
 *    error details in `reasoning`.
 */

import { GoogleGenerativeAI, SchemaType, Schema } from "@google/generative-ai";
import type { SpecChange } from "@/lib/stripe/changelog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatchInput {
  /** The breaking changes detected by diffSpecs(). */
  changes: SpecChange[];
  /** Human-readable one-line summary of the overall change set. */
  changesSummary: string;
  /** The file to patch. */
  file: {
    path: string;
    content: string;
  };
}

export interface PatchResult {
  filePath: string;
  originalContent: string;
  /** Full updated file content. Equal to originalContent if no change needed. */
  patchedContent: string;
  /** One-paragraph explanation of what was changed and why. */
  reasoning: string;
  /** True if patchedContent differs from originalContent. */
  changed: boolean;
}

// ---------------------------------------------------------------------------
// Schema for Structured Output
// ---------------------------------------------------------------------------

const patchResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    patchedContent: {
      type: SchemaType.STRING,
      description: "The complete updated source code file content. This must be the entire file containing any fixes required. If no changes are needed, return the original content exactly.",
    },
    reasoning: {
      type: SchemaType.STRING,
      description: "A one paragraph explanation of what changes were made, which lines were affected, and why they were necessary.",
    },
  },
  required: ["patchedContent", "reasoning"],
};

// ---------------------------------------------------------------------------
// Prompt Builders
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert TypeScript developer specialising in Stripe SDK migrations.

Your job is to update a TypeScript/JavaScript source file so it is compatible
with a Stripe API breaking change. Follow these rules strictly:

1. Make the MINIMUM change required — do not refactor unrelated code.
2. Preserve all existing comments, formatting, and logic that is unaffected.
3. If no change is needed (the file is already compatible), return the original file content unchanged.`;

function buildUserPrompt(input: PatchInput): string {
  const changeList = input.changes
    .map((c) => `  • [${c.type}] ${c.location}\n    ${c.description}`)
    .join("\n");

  return `## Stripe API Breaking Change
${input.changesSummary}

### Detailed changes
${changeList}

## File to update
Path: ${input.file.path}

\`\`\`typescript
${input.file.content}
\`\`\`

Return the updated file content and reasoning matching the JSON schema.`;
}

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let _ai: GoogleGenerativeAI | null = null;

function getAIClient(): GoogleGenerativeAI {
  if (_ai) return _ai;
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY is not set");
  }
  _ai = new GoogleGenerativeAI(apiKey);
  return _ai;
}

function getModel(): string {
  // Using gemini-2.5-flash as default to stay within free-tier quota limits.
  return process.env.GOOGLE_AI_MODEL ?? "gemini-2.5-flash";
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Calls Gemini to generate a patched version of a single file.
 * Never throws — errors are captured in `reasoning` with `changed: false`.
 */
export async function generatePatch(input: PatchInput): Promise<PatchResult> {
  const { file } = input;

  console.log(`[patch-gen] Generating patch via Gemini for ${file.path} ...`);

  try {
    const ai = getAIClient();
    const modelName = getModel();
    const model = ai.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: patchResponseSchema,
        temperature: 0.1, // low temperature for deterministic code editing
      },
      systemInstruction: SYSTEM_PROMPT,
    });

    const response = await model.generateContent(buildUserPrompt(input));
    const responseText = response.response.text();
    if (!responseText) {
      throw new Error("Empty response received from Gemini");
    }

    const parsed = JSON.parse(responseText) as {
      patchedContent: string;
      reasoning: string;
    };

    if (
      typeof parsed.patchedContent !== "string" ||
      typeof parsed.reasoning !== "string"
    ) {
      throw new Error("Gemini response missing required schema fields");
    }

    const patchedContent = parsed.patchedContent;
    const changed = patchedContent !== file.content;

    console.log(
      `[patch-gen] ${file.path}: ${changed ? "patch applied" : "no change needed"}`
    );

    return {
      filePath: file.path,
      originalContent: file.content,
      patchedContent,
      reasoning: parsed.reasoning,
      changed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[patch-gen] Failed for ${file.path}:`, message);

    return {
      filePath: file.path,
      originalContent: file.content,
      patchedContent: file.content, // unchanged on error
      reasoning: `Patch generation failed: ${message}`,
      changed: false,
    };
  }
}

/**
 * Generates patches for multiple files sequentially.
 * Sequential (not parallel) to respect Gemini API rate limits.
 */
export async function generatePatches(
  inputs: PatchInput[]
): Promise<PatchResult[]> {
  const results: PatchResult[] = [];
  for (const input of inputs) {
    results.push(await generatePatch(input));
  }
  return results;
}
