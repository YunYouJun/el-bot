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
 * 收到的内容
 */
interface ContextBody {
  /**
   * 定义类型
   */
  type: string;
  [propName: string]: any;
}

/**
 * webhook
 */
export default class Webhook {
  // 默认配置
  config: WebhookConfig;
  emitter: events.EventEmitter;
  githubHandler: Webhooks<any>;
  middleware: (
    request: any,
    response: any,
    next?: Function | undefined
  ) => Promise<any>;
  constructor(public ctx: Bot) {
    this.config = ctx.el.webhook!;
    this.emitter = new events.EventEmitter();
    const { handler, middleware } = githubHandler(ctx);
    this.githubHandler = handler;
    this.middleware = middleware;
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
      return this.middleware(ctx.req, ctx.res, next);
    });

    app.use((ctx) => {
      this.parse(ctx);
    });

    let server: Server | undefined;
    try {
      server = app.listen(this.config.port);
      this.ctx.logger.success(
        `Webhook Listening localhost:${this.config.port}`
      );
    } catch (err) {
      this.ctx.logger.error(err.message);
    }
    return server;
  }

  /**
   * response
   * @param ctx
   */
  parse(ctx: Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>) {
    let type = "";
    const body = ctx.body as ContextBody;
    if (ctx.request.method === "GET" && ctx.request.query.type) {
      type = ctx.request.query.type as string;
      this.emitter.emit(type, ctx.request.query, ctx.res);
    } else if (ctx.request.method === "POST" && body.type) {
      type = body.type;
      this.emitter.emit(type, ctx.body, ctx.res);
      this.ctx.logger.info(`[webhook](${type})`);
      if (this.ctx.isDev) {
        this.ctx.logger.info(
          `[webhook](ctx.body): ${JSON.stringify(ctx.body)}`
        );
      }
    } else {
      this.ctx.logger.error("[webhook] 收到未知类型的请求");
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
