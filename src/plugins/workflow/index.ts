import Bot from "el-bot";

/**
 * ref github actions
 * https://docs.github.com/en/actions/configuring-and-managing-workflows/configuring-a-workflow
 */

import { EventType, MessageType } from "mirai-ts";
import fs from "fs";
import { parse } from "../../utils/config";
import { exec } from "shelljs";
import schedule from "node-schedule";

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

/**
 * 定时格式
 */
interface Schedule {
  cron: string;
}

interface On {
  schedule: [Schedule];
}

interface WorkflowConfig {
  name: string;
  on: On | MessageAndEventType | MessageAndEventType[];
  jobs: Jobs;
}

/**
 * config a workflow
 */
function createWorkflow(ctx: Bot, workflow: WorkflowConfig) {
  const mirai = ctx.mirai;
  if (!workflow.on) return;

  if (Array.isArray(workflow.on)) {
    workflow.on.forEach((on) => {
      trigger(on);
    });
  } else if (typeof workflow.on === "string") {
    trigger(workflow.on);
  } else if ((workflow.on as On).schedule) {
    (workflow.on as On).schedule.forEach((singleSchedule) => {
      schedule.scheduleJob(singleSchedule.cron, () => {
        doJobs(workflow.jobs);
      });
    });
  }

  /**
   * 触发
   * @param type
   */
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

  /**
   * 运行 jobs 中终端命令
   */
  function doJobs(jobs: Jobs) {
    Object.keys(jobs).forEach((name) => {
      const job = jobs[name];
      job.steps.forEach((step) => {
        if (step.run) {
          exec(step.run);
        }
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
      if (workflow) {
        createWorkflow(ctx, workflow as WorkflowConfig);
      }
    });
  } catch (err) {
    // 不是 文件不存在 的错误时，才打印出错信息
    if (err.code !== "ENOENT") {
      console.error(err.message);
    }
  }
}
