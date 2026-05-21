import { askQuestion } from "@/lib/rag";

export async function POST(req: Request) {
  const body = await req.json();

  const result = await askQuestion(
    body.question,
    body.model,
    body.isOnline
  );

  return Response.json(result);
}