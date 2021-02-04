import Bot from "..";
import Koa from "koa";
import cors from "@koa/cors";
import bodyParser from "koa-bodyparser";
import events from "events";
import githubHandler from "./github-handler";
import { Webhooks } from "@octokit/webhooks";
import { Server } from "net";
export interface WebhookConfig {
  /**
   * 是否启用
   */
  enable?: boolean;
  port?: number;
  path?: string;
  secret?: string;
  /**
   * 回调函数
   */
  callback?: (webhook: any) => {};
}

/**
 * webhook
 */
export default class Webhook {
  // 默认配置
  config: WebhookConfig;
  emitter: events.EventEmitter;
  githubHandler: Webhooks;
  constructor(public bot: Bot) {
    this.config = bot.el.webhook;
    this.emitter = new events.EventEmitter();
    this.githubHandler = githubHandler(bot);
  }

  /**
   * 启动 webhhook
   * @param cb
   */
  start(config?: WebhookConfig) {
    if (config) {
      this.config = Object.assign(this.config);
    }

    const app = new Koa();
    app.use(cors());
    app.use(bodyParser());
    app.use((ctx, next) => {
      ctx.body = (ctx.request as any).body;
      (ctx.req as any)["body"] = ctx.body;
      ctx.status = 200;
      return this.githubHandler.middleware(ctx.req, ctx.res, next);
    });

    app.use((ctx) => {
      this.parse(ctx);
    });

    let server: Server | undefined;
    try {
      server = app.listen(this.config.port);
      this.bot.logger.success(
        `Webhook Listening localhost:${this.config.port}`
      );
    } catch (err) {
      this.bot.logger.error(err.message);
    }
    return server;
  }

  /**
   * response
   * @param ctx
   */
  parse(ctx: Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>) {
    let type = "";
    if (ctx.request.method === "GET" && ctx.request.query.type) {
      type = ctx.request.query.type;
      this.emitter.emit(type, ctx.request.query, ctx.res);
    } else if (ctx.request.method === "POST" && ctx.body.type) {
      type = ctx.body.type;
      this.emitter.emit(type, ctx.body, ctx.res);
      this.bot.logger.info(`[webhook](${type})`);
      if (this.bot.isDev) {
        this.bot.logger.info(
          `[webhook](ctx.body): ${JSON.stringify(ctx.body)}`
        );
      }
    } else {
      this.bot.logger.error("[webhook] 收到未知类型的请求");
    }
  }

  /**
   * 监听
   * @param type 类型
   * @param callback 回调函数
   */
  on(type: string, callback: Function) {
    // data 为解析后的参数
    // res 为返回信息
    this.emitter.on(type, (data, res) => {
      callback(data, res);
    });
  }
}
