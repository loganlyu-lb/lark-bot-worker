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

  console.log("[worker] event object_kind:", body?.object_kind);

  const robot = createRobot({
    webhook: env.WEBHOOK,
    signSecret: env.SIGN_SECRET,
  });

  try {
    const result = await handleGitlabWebhook(body, robot);
    console.log("[worker] result:", JSON.stringify(result));
    return new Response(
      JSON.stringify(result),
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[worker] error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
};

const exportedHandler: ExportedHandler<WorkerEnv> = {
  fetch,
};

export default exportedHandler;
