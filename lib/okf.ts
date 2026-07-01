import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { Ollama } from "@langchain/ollama";
import settings from "./settings";

const OKF_DIR = path.join(process.cwd(), "okf-version");
const RESERVED = ["index.md", "log.md"];

interface OKFFile {
  filename: string;
  title: string;
  type: string;
  description: string;
  body: string;
}

function parseOKF(filename: string): OKFFile | null {
  const filepath = path.join(OKF_DIR, filename);
  if (!fs.existsSync(filepath)) return null;

  const raw = fs.readFileSync(filepath, "utf8").trim();
  if (!raw) return null;

  let frontmatter: Record<string, string> = {};
  let body = raw;

  if (raw.startsWith("---")) {
    const end = raw.indexOf("---", 3);
    if (end !== -1) {
      const yamlBlock = raw.slice(3, end).trim();
      body = raw.slice(end + 3).trim();
      for (const line of yamlBlock.split("\n")) {
        const colon = line.indexOf(":");
        if (colon === -1) continue;
        const key = line.slice(0, colon).trim();
        const val = line.slice(colon + 1).trim();
        frontmatter[key] = val;
      }
    }
  }

  return {
    filename,
    title: frontmatter.title || filename,
    type: frontmatter.type || "unknown",
    description: frontmatter.description || "",
    body,
  };
}

function loadAllConcepts(): OKFFile[] {
  if (!fs.existsSync(OKF_DIR)) return [];
  return fs
    .readdirSync(OKF_DIR)
    .filter((f) => f.endsWith(".md") && !RESERVED.includes(f))
    .map((f) => parseOKF(f))
    .filter(Boolean) as OKFFile[];
}

// Simple keyword relevance score — no embeddings needed
function scoreRelevance(concept: OKFFile, question: string): number {
  const q = question.toLowerCase();
  const haystack = `${concept.title} ${concept.description} ${concept.body}`.toLowerCase();
  const words = q.split(/\s+/).filter((w) => w.length > 3);
  return words.filter((w) => haystack.includes(w)).length;
}

export async function askOKF(
  question: string,
  model: string = "phi3:mini",
  isOnline: boolean = false
) {
  const concepts = loadAllConcepts();

  // Score and rank — take top 3 relevant files
  const scored = concepts
    .map((c) => ({ ...c, score: scoreRelevance(c, question) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .filter((c) => c.score > 0);

  // Fallback: use all concepts if nothing matched
  const selected = scored.length > 0 ? scored : concepts.slice(0, 3);

  const context = selected
    .map((c) => `## [${c.title}] (${c.filename})\n${c.body}`)
    .join("\n\n---\n\n");

  const prompt = `You are an HR policy assistant. Answer ONLY using the OKF knowledge bundle below.

${context}

Question: ${question}`;

  let answer = "";

  if (isOnline) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN not set in .env.local");
    const openai = new OpenAI({
      apiKey: token,
      baseURL: "https://models.github.ai/inference",
    });
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });
    answer = res.choices[0]?.message?.content || "No response.";
  } else {
    const llm = new Ollama({ model, baseUrl: "http://localhost:11434" });
    answer = await llm.invoke(prompt);
  }

  if (settings.LOCAL_DEBUGGING) {
    const debugDir = path.join(process.cwd(), "_local_debug");
    fs.mkdirSync(debugDir, { recursive: true });
    const entry = [
      `=== ${new Date().toISOString()} ===`,
      `QUERY: ${question}`,
      `MODEL: ${model} | ONLINE: ${isOnline}`,
      `FILES SELECTED (${selected.length}):`,
      ...selected.map((c) => `  - ${c.filename} [score: ${(c as any).score ?? "?"}] | ${c.title}`),
      `\nFULL PROMPT / CONTEXT:\n${prompt}`,
      `\nANSWER:\n${answer}`,
      "",
    ].join("\n");
    fs.appendFileSync(path.join(debugDir, "debug_okf_qna.txt"), entry + "\n", "utf8");
  }

  return {
    answer,
    sources: selected.map((c) => ({
      filename: c.filename,
      title: c.title,
      type: c.type,
      description: c.description,
    })),
  };
}
