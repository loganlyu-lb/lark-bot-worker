import type { LarkRobot } from "./lark/robot";
import type {
  WebhookEvents,
  PushEvent,
  TagPushEvent,
  MergeRequestEvent,
  PipelineEvent,
  CommentEvent,
  IssueEvent,
  JobEvent,
} from "gitlab-event-types";

type HeaderTemplate =
  | "blue"
  | "green"
  | "orange"
  | "red"
  | "purple"
  | "indigo"
  | "turquoise"
  | "yellow"
  | "grey"
  | "wathet"
  | "violet"
  | "carmine";

/**
 * See https://open.feishu.cn/tool/cardbuilder?from=howtoguide
 */
export const makeInteractiveCard = ({
  title,
  content,
  url,
  headerTemplate = "purple",
  at,
  atAll,
}: {
  title: string;
  content: string;
  url?: string;
  headerTemplate?: HeaderTemplate;
  /**
   * Custom bot only supports `@users` using open_id;
   */
  at?: string[];
  atAll?: boolean;
}) =>
  ({
    config: {
      wide_screen_mode: true,
    },

    header: {
      template: headerTemplate,
      title: {
        tag: "plain_text",
        content: title,
      },
    },

    elements: [
      {
        tag: "markdown",
        content,
      },

      at && {
        tag: "div",
        text: {
          content: at.map((email) => `<at email=${email}></at>`).join(" "),
          tag: "lark_md",
        },
      },

      atAll && {
        tag: "div",
        text: {
          content: "<at id=all></at>",
          tag: "lark_md",
        },
      },

      url && {
        actions: [
          {
            tag: "button",
            text: {
              content: "立即查看",
              tag: "plain_text",
            },
            type: "primary",
            url,
          },
        ],
        tag: "action",
      },
    ].filter(Boolean),
  }) as const;

/** Collect unique non-empty emails from GitLab User objects */
function collectEmails(...users: Array<{ email?: string } | undefined>): string[] {
  const emails = new Set<string>();
  for (const u of users) {
    if (u?.email) emails.add(u.email);
  }
  return [...emails];
}

const MR_ACTION_MAP: Record<string, string> = {
  open: "创建了",
  close: "关闭了",
  reopen: "重新打开了",
  update: "更新了",
  approved: "批准了",
  unapproved: "取消批准了",
  approval: "批准了",
  unapproval: "取消批准了",
  merge: "合并了",
};

const PIPELINE_STATUS_MAP: Record<string, { text: string; template: HeaderTemplate }> = {
  success: { text: "✅ 成功", template: "green" },
  failed: { text: "❌ 失败", template: "red" },
  running: { text: "🔄 运行中", template: "blue" },
  pending: { text: "⏳ 等待中", template: "yellow" },
  canceled: { text: "🚫 已取消", template: "grey" },
  skipped: { text: "⏭ 已跳过", template: "grey" },
  manual: { text: "🔧 手动", template: "orange" },
  created: { text: "🆕 已创建", template: "wathet" },
};

function handleNote(event: CommentEvent) {
  // @ MR assignee so they see the comment (exclude the commenter themselves)
  const at = collectEmails(event.merge_request?.assignee).filter(
    (e) => e !== event.user.email,
  );
  return makeInteractiveCard({
    title: `${event.project.name} 有新的评论`,
    content: [
      event.merge_request?.title ? `**${event.merge_request.title}**` : "",
      event.object_attributes.note,
    ]
      .filter(Boolean)
      .join("\n"),
    url: event.object_attributes.url,
    at: at.length ? at : undefined,
  });
}

function handleMergeRequest(event: MergeRequestEvent) {
  const { object_attributes: mr, user, project } = event;
  const action = MR_ACTION_MAP[mr.action] ?? mr.action;
  const lines = [
    `**${mr.title}**`,
    `${user.name} ${action} Merge Request`,
    `\`${mr.source_branch}\` → \`${mr.target_branch}\``,
  ];
  if (mr.description) {
    lines.push("", mr.description.length > 200 ? mr.description.slice(0, 200) + "..." : mr.description);
  }
  if (event.assignees?.length) {
    lines.push(`**指派给:** ${event.assignees.map((a) => a.name).join(", ")}`);
  }
  if (event.reviewers?.length) {
    lines.push(`**审核人:** ${event.reviewers.map((r) => r.name).join(", ")}`);
  }

  const templateMap: Record<string, HeaderTemplate> = {
    open: "blue",
    merge: "green",
    close: "grey",
    approved: "green",
    unapproved: "orange",
  };

  // @ assignees + reviewers on open/update, @ assignees on other actions
  const atUsers =
    mr.action === "open" || mr.action === "update" || mr.action === "reopen"
      ? [...(event.assignees ?? []), ...(event.reviewers ?? [])]
      : (event.assignees ?? []);
  const at = collectEmails(...atUsers).filter((e) => e !== user.email);

  return makeInteractiveCard({
    title: `${project.name} Merge Request ${action}`,
    content: lines.join("\n"),
    url: mr.url,
    headerTemplate: templateMap[mr.action] ?? "purple",
    at: at.length ? at : undefined,
  });
}

function handlePipeline(event: PipelineEvent) {
  const { object_attributes: pipeline, project, commit, merge_request } = event;
  if (pipeline.status !== "failed") return null;

  const status = PIPELINE_STATUS_MAP[pipeline.status] ?? {
    text: pipeline.status,
    template: "purple" as HeaderTemplate,
  };

  const lines = [
    `**Pipeline #${pipeline.id}** ${status.text}`,
    `**分支:** \`${pipeline.ref}\``,
  ];
  if (merge_request) {
    lines.push(`**Merge Request:** ${merge_request.title}`);
  }
  if (commit) {
    lines.push(`**提交:** ${commit.title ?? commit.message.split("\n")[0]}`);
    lines.push(`**提交者:** ${commit.author.name}`);
  }
  if (pipeline.duration) {
    const min = Math.floor(pipeline.duration / 60);
    const sec = pipeline.duration % 60;
    lines.push(`**耗时:** ${min > 0 ? `${min}m ` : ""}${sec}s`);
  }
  if (pipeline.stages?.length) {
    lines.push(`**阶段:** ${pipeline.stages.join(" → ")}`);
  }

  // @ commit author when pipeline fails
  const at =
    pipeline.status === "failed" ? collectEmails(commit?.author as { email?: string } | undefined, event.user) : undefined;

  return makeInteractiveCard({
    title: `${project.name} Pipeline ${status.text}`,
    content: lines.join("\n"),
    url: `${project.web_url}/-/pipelines/${pipeline.id}`,
    headerTemplate: status.template,
    at: at?.length ? at : undefined,
  });
}

function handlePush(event: PushEvent) {
  const { project, commits, ref, user_name, total_commits_count } = event;
  const branch = ref.replace("refs/heads/", "");
  const lines = [
    `**${user_name}** 推送了 ${total_commits_count} 个提交到 \`${branch}\``,
  ];
  const displayCommits = commits.slice(0, 5);
  for (const c of displayCommits) {
    const shortId = c.id.slice(0, 8);
    const msg = c.message.split("\n")[0];
    lines.push(`• [\`${shortId}\`](${c.url}) ${msg}`);
  }
  if (total_commits_count > 5) {
    lines.push(`... 以及其他 ${total_commits_count - 5} 个提交`);
  }

  return makeInteractiveCard({
    title: `${project.name} 有新的推送`,
    content: lines.join("\n"),
    url: `${project.web_url}/-/commits/${branch}`,
    headerTemplate: "blue",
  });
}

function handleTagPush(event: TagPushEvent) {
  const { project, ref, user_name, commits, total_commits_count } = event;
  const tag = ref.replace("refs/tags/", "");
  const lines = [`**${user_name}** 推送了标签 \`${tag}\``];
  if (total_commits_count > 0 && commits.length > 0) {
    const latest = commits[0];
    lines.push(`**最新提交:** ${latest.message.split("\n")[0]}`);
  }

  return makeInteractiveCard({
    title: `${project.name} 新标签 ${tag}`,
    content: lines.join("\n"),
    url: `${project.web_url}/-/tags/${tag}`,
    headerTemplate: "turquoise",
  });
}

function handleIssue(event: IssueEvent) {
  const { object_attributes: issue, user, project } = event;
  const action = issue.action === "open" ? "创建了" : issue.action === "close" ? "关闭了" : issue.action === "reopen" ? "重新打开了" : issue.action;
  const lines = [`**${issue.title}**`, `${user.name} ${action} Issue`];
  if (issue.description) {
    lines.push("", issue.description.length > 200 ? issue.description.slice(0, 200) + "..." : issue.description);
  }

  const templateMap: Record<string, HeaderTemplate> = {
    open: "blue",
    close: "grey",
    reopen: "blue",
    update: "purple",
  };

  // @ assignees, exclude the actor
  const at = collectEmails(...(event.assignees ?? []), event.assignee).filter(
    (e) => e !== user.email,
  );

  return makeInteractiveCard({
    title: `${project.name} Issue ${action}`,
    content: lines.join("\n"),
    url: issue.url,
    headerTemplate: templateMap[issue.action] ?? "purple",
    at: at.length ? at : undefined,
  });
}

function handleJob(event: JobEvent) {
  const status = PIPELINE_STATUS_MAP[event.build_status] ?? {
    text: event.build_status,
    template: "purple" as HeaderTemplate,
  };
  const lines = [
    `**Job:** ${event.build_name} ${status.text}`,
    `**阶段:** ${event.build_stage}`,
    `**分支:** \`${event.ref}\``,
  ];
  if (event.commit) {
    lines.push(`**提交:** ${event.commit.message.split("\n")[0]}`);
  }
  if (event.build_duration) {
    const dur = Number(event.build_duration);
    if (!isNaN(dur)) {
      const min = Math.floor(dur / 60);
      const sec = Math.round(dur % 60);
      lines.push(`**耗时:** ${min > 0 ? `${min}m ` : ""}${sec}s`);
    }
  }

  // @ the user when job fails
  const at =
    event.build_status === "failed" ? collectEmails(event.user) : undefined;

  return makeInteractiveCard({
    title: `${event.project_name} Job ${status.text}`,
    content: lines.join("\n"),
    url: event.repository?.homepage
      ? `${event.repository.homepage}/-/jobs/${event.build_id}`
      : undefined,
    headerTemplate: status.template,
    at: at?.length ? at : undefined,
  });
}

export const handleGitlabWebhook = async (
  event: WebhookEvents,
  robot: LarkRobot,
) => {
  let card;

  if (!("object_kind" in event)) {
    console.error("Unknown event:", event);
    return;
  }

  switch (event.object_kind) {
    case "note":
      card = handleNote(event);
      break;
    case "merge_request":
      card = handleMergeRequest(event);
      break;
    case "pipeline":
      card = handlePipeline(event);
      break;
    case "push":
      card = handlePush(event);
      break;
    case "tag_push":
      card = handleTagPush(event);
      break;
    case "issue":
      card = handleIssue(event);
      break;
    case "build":
      card = handleJob(event);
      break;
    default:
      console.error("Unhandled event:", event.object_kind);
      return;
  }

  if (!card) return;
  return robot.send({ msg_type: "interactive", card });
};
