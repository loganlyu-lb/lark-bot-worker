import { createRobot } from "./lark/robot";
import type { Webhook } from "./lark/types";
import { handleGitlabWebhook } from "./gitlabHandler";

interface WorkerEnv {
  WEBHOOK?: Webhook;
  SIGN_SECRET?: string;
}

const fetch: ExportedHandlerFetchHandler<WorkerEnv> = async (
  request,
  env,
  ctx,
) => {
  if (!env.WEBHOOK) {
    throw new Error(
      "Specified secret 'WEBHOOK' not found in environment variables.",
    );
  }

  if (request.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const robot = createRobot({
    webhook: env.WEBHOOK,
    signSecret: env.SIGN_SECRET,
  });

  return new Response(
    JSON.stringify(await handleGitlabWebhook(body, robot)),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
};

const exportedHandler: ExportedHandler<WorkerEnv> = {
  fetch,
};

export default exportedHandler;
