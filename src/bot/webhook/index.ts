import Bot from "..";
import { log } from "mirai-ts";
import { initGitHubHandler } from "./handler";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import events from "events";

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
  constructor(public bot: Bot) {
    this.config = {
      enable: true,
      port: 7777,
      path: "/webhook",
      secret: "el-psy-congroo",
    };
    this.emitter = new events.EventEmitter();
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
    app.use(bodyParser());
    app.use((ctx) => {
      ctx.body = ctx.request.body;
      this.parse(ctx);
      // github handler
      initGitHubHandler(this.config, ctx.req, ctx.res);
    });
    app.listen(this.config.port);

    log.success(`Webhook Listening ${this.config.path}:${this.config.port}`);

    // 执行回调函数
    if (this.config.callback) {
      this.config.callback(this);
    }
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
      type = ctx.request.body.type;
      this.emitter.emit(type, ctx.request.body);

      log.info(`[webhook] ${type}, ${ctx.request.body}`);
    } else {
      log.error("[webhook] 收到未知类型的请求");
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
