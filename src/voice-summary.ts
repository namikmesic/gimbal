import * as fs from "fs";
import * as path from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

interface TranscriptMessage {
  time: string;
  from: string;
  to: string;
  content: string;
}

interface ParsedTranscript {
  startTime: string;
  direction?: string;
  messages: TranscriptMessage[];
  endTime?: string;
}

export interface VoiceSummaryOptions {
  transcriptPath: string;
  outputPath?: string;
  voiceId?: string;
}

/**
 * Parse a TRANSCRIPT.md file into structured data.
 */
export function parseTranscript(content: string): ParsedTranscript {
  const lines = content.split("\n");
  const result: ParsedTranscript = {
    startTime: "",
    messages: [],
  };

  // Extract session metadata
  const startedMatch = content.match(/\*\*Started:\*\*\s*(.+)/);
  if (startedMatch) {
    result.startTime = startedMatch[1].trim();
  }

  const directionMatch = content.match(/\*\*Direction:\*\*\s*(.+)/);
  if (directionMatch) {
    result.direction = directionMatch[1].trim();
  }

  const endedMatch = content.match(/\*\*Ended:\*\*\s*(.+)/);
  if (endedMatch) {
    result.endTime = endedMatch[1].trim();
  }

  // Parse messages - format: ### [HH:MM:SS] from → to
  const messageHeaderRegex = /^### \[(\d{2}:\d{2}:\d{2})\] (.+?) → (.+)$/;
  let currentMessage: TranscriptMessage | null = null;
  let contentLines: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(messageHeaderRegex);

    if (headerMatch) {
      // Save previous message
      if (currentMessage) {
        currentMessage.content = contentLines.join("\n").trim();
        result.messages.push(currentMessage);
      }

      // Start new message
      currentMessage = {
        time: headerMatch[1],
        from: headerMatch[2],
        to: headerMatch[3],
        content: "",
      };
      contentLines = [];
    } else if (currentMessage && line !== "---") {
      contentLines.push(line);
    }
  }

  // Save final message
  if (currentMessage) {
    currentMessage.content = contentLines.join("\n").trim();
    result.messages.push(currentMessage);
  }

  return result;
}

/**
 * Generate a "Friday demo" style summary using Claude.
 */
async function generateSummaryText(transcript: ParsedTranscript): Promise<string> {
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

  const transcriptSummary = `Session Direction: ${transcript.direction || "Not specified"}
Started: ${transcript.startTime}
${transcript.endTime ? `Ended: ${transcript.endTime}` : ""}

Conversation between agents:
${transcript.messages.map((m) => `[${m.from} → ${m.to}]: ${m.content}`).join("\n\n")}`;

  const prompt = `Create a spoken "Friday Demo" summary for this multi-agent development session:

${transcriptSummary}`;

  let summaryText = "";

  const response = query({
    prompt,
    options: {
      model: "claude-sonnet-4-5-20250514",
      systemPrompt,
      allowedTools: [],
    },
  });

  for await (const message of response) {
    if (message.type === "assistant" && "content" in message) {
      if (typeof message.content === "string") {
        summaryText += message.content;
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

  // Parse transcript
  const content = fs.readFileSync(transcriptPath, "utf-8");
  const transcript = parseTranscript(content);

  if (transcript.messages.length === 0) {
    throw new Error("No messages found in transcript. Is the file empty?");
  }

  // Generate summary
  console.log("Generating summary with Claude...");
  const summaryText = await generateSummaryText(transcript);

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
