import * as fs from "fs";
import * as path from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { TranscriptReaderImpl, ParsedSession } from "./transcript-writer.js";

export interface VoiceSummaryOptions {
  transcriptPath: string;
  outputPath?: string;
  voiceId?: string;
}

/**
 * Generate a "Friday demo" style summary using Claude.
 */
async function generateSummaryText(session: ParsedSession): Promise<string> {
  const systemPrompt = `You are a tech lead preparing a "Friday Demo" style summary of an automated multi-agent development session. Your summary will be read aloud, so write for spoken delivery.

Guidelines:
- START with enthusiasm about what was accomplished
- Highlight the PROBLEM that was identified or assigned
- Explain the SOLUTION in simple, non-technical terms when possible
- Celebrate the OUTCOME and what it means for users/developers
- Keep under 2 minutes spoken (~250-300 words)
- Use conversational language suitable for being read aloud
- End with forward momentum (what this enables next)
- Avoid code snippets or highly technical details
- Use natural pauses and transitions

Output only the summary text, ready to be read aloud. No headers or formatting.`;

  // Format messages for the prompt
  const messagesSummary = session.messages
    .map((m) => {
      const target = m.channel || m.to;
      return `[${m.from} → ${target}]: ${m.content}`;
    })
    .join("\n\n");

  const transcriptSummary = `Session Direction: ${session.direction || "Not specified"}
Started: ${session.startTime}
${session.endTime ? `Ended: ${session.endTime}` : ""}

Conversation between agents:
${messagesSummary}`;

  const prompt = `Create a spoken "Friday Demo" summary for this multi-agent development session:

${transcriptSummary}`;

  let summaryText = "";

  const response = query({
    prompt,
    options: {
      model: "opus",
      systemPrompt,
      cwd: process.cwd(),
      permissionMode: "default" as const,
      tools: [],
    },
  });

  for await (const message of response) {
    if (message.type === "system" && message.subtype === "init") {
      // Session initialized
      continue;
    }
    if (message.type === "assistant") {
      // Extract text from the BetaMessage content array
      const betaMessage = message.message;
      if (betaMessage && betaMessage.content) {
        for (const block of betaMessage.content) {
          if ("text" in block && typeof block.text === "string") {
            summaryText += block.text;
          }
        }
      }
    }
    if (message.type === "result") {
      if (message.subtype !== "success") {
        const errorMsg = "errors" in message ? (message as { errors?: string[] }).errors?.join(", ") : "Unknown error";
        throw new Error(`Claude query failed: ${errorMsg}`);
      }
    }
  }

  return summaryText.trim();
}

/**
 * Convert text to speech using ElevenLabs API.
 */
async function convertToSpeech(
  text: string,
  voiceId: string,
  outputPath: string
): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY environment variable is required.\n" +
      "Get your API key at: https://elevenlabs.io/app/settings/api-keys"
    );
  }

  const client = new ElevenLabsClient({ apiKey });

  const audioStream = await client.textToSpeech.convert(voiceId, {
    text,
    modelId: "eleven_multilingual_v2",
    outputFormat: "mp3_44100_128",
  });

  // Collect audio chunks and write to file
  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) {
    chunks.push(Buffer.from(chunk));
  }

  const audioBuffer = Buffer.concat(chunks);
  fs.writeFileSync(outputPath, audioBuffer);
}

/**
 * Main entry point: generate a voice summary from a transcript file.
 */
export async function generateVoiceSummary(
  options: VoiceSummaryOptions
): Promise<string> {
  // Resolve and validate transcript path
  const transcriptPath = path.resolve(options.transcriptPath);
  if (!fs.existsSync(transcriptPath)) {
    throw new Error(`Transcript file not found: ${transcriptPath}`);
  }

  // Parse transcript using the shared reader
  const session = TranscriptReaderImpl.parseFile(transcriptPath);

  if (session.messages.length === 0) {
    throw new Error("No messages found in transcript. Is the file empty?");
  }

  // Generate summary
  console.log("Generating summary with Claude...");
  const summaryText = await generateSummaryText(session);

  console.log("\n--- Summary ---");
  console.log(summaryText);
  console.log("--- End Summary ---\n");

  // Convert to speech
  const outputPath = options.outputPath
    ? path.resolve(options.outputPath)
    : path.join(path.dirname(transcriptPath), "summary.mp3");

  // Default voice: Adam (professional narrator)
  const voiceId = options.voiceId || "pNInz6obpgDQGcFmaJgB";

  console.log("Converting to speech with ElevenLabs...");
  await convertToSpeech(summaryText, voiceId, outputPath);

  return outputPath;
}
