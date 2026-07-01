import { askOKF } from "@/lib/okf";

export async function POST(req: Request) {
  const body = await req.json();
  const result = await askOKF(body.question, body.model, body.isOnline);
  return Response.json(result);
}
