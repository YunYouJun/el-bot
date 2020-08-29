/**
 * ref github actions
 * https://docs.github.com/en/actions/configuring-and-managing-workflows/configuring-a-workflow
 */

import { EventType, MessageType } from "mirai-ts";
import Bot from "src/bot";
import fs from "fs";
import { parse } from "../../utils/config";

interface step {
  name?: string;
  run?: string;
  reply: string | MessageType.MessageChain;
}

interface Job {
  name?: string;
  steps: step[];
}

interface Jobs {
  [propName: string]: Job;
}

type MessageAndEventType =
  | "message"
  | EventType.EventType
  | MessageType.ChatMessageType;

interface WorkflowConfig {
  name: string;
  on: MessageAndEventType | MessageAndEventType[];
  jobs: Jobs;
}

/**
 * config a workflow
 */
function createWorkflow(ctx: Bot, workflow: WorkflowConfig) {
  const mirai = ctx.mirai;
  if (Array.isArray(workflow.on)) {
    workflow.on.forEach((on) => {
      trigger(on);
    });
  } else {
    trigger(workflow.on);
  }

  function trigger(type: MessageAndEventType) {
    mirai.on(type, (msg) => {
      Object.keys(workflow.jobs).forEach((name) => {
        const job = workflow.jobs[name];
        job.steps.forEach((step) => {
          if (msg.reply) {
            msg.reply(step.reply);
          }
        });
      });
    });
  }
}

export default function workflow(ctx: Bot) {
  try {
    const folder = "./el/workflows";
    const files = fs.readdirSync(folder);
    files.forEach((file) => {
      const workflow = parse(`${folder}/${file}`);
      createWorkflow(ctx, workflow);
    });
  } catch (err) {
    // 不是 文件不存在 的错误时，才打印出错信息
    if (err.code !== "ENOENT") {
      console.error(err.message);
    }
  }
}
