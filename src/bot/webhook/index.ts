import Bot from "..";
import Koa from "koa";
import cors from "@koa/cors";
import bodyParser from "koa-bodyparser";
import events from "events";
import githubHandler, { handler } from "./github-handler";

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
  githubHandler: handler;
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
    app.use((ctx) => {
      ctx.body = (ctx.request as any).body;
      this.parse(ctx);
      // github handler
      this.githubHandler(ctx.req, ctx.res, (err) => {
        this.bot.logger.error("[Webhook](GitHub) There is no github event.");
      });
    });
    const server = app.listen(this.config.port);

    this.bot.logger.success(`Webhook Listening localhost:${this.config.port}`);
    return server;
  }

  /**
   * response
   * @param ctx
   */
  parse(ctx: Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>) {
    let type = "*";
    if (ctx.request.method === "GET") {
      type = ctx.request.query.type;
      this.emitter.emit(type, ctx.request.query);
    } else if (ctx.request.method === "POST") {
      type = ctx.body.type;
      this.emitter.emit(type, ctx.body);
      this.bot.logger.info(`[webhook](${type}): ${JSON.stringify(ctx.body)}`);
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
    this.emitter.on(type, (data) => {
      callback(data);
    });
  }
}
