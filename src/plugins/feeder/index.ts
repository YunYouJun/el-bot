import ElBot from "../../bot";
import RssFeedEmitter from "rss-feed-emitter";
import { MessageType } from "mirai-ts";
import { Feeder, IFeeder } from "./feeder.scheme";

const feeder = new RssFeedEmitter({
  skipFirstLoad: true,
});

export default async function (ctx: ElBot) {
  const { cli } = ctx;

  const feederConfig = await Feeder.find({}, { target: 0 });
  feederConfig.forEach((config) => {
    subscribe(config);
  });

  cli
    .command("feeder")
    .description("在线订阅")
    .option("-a, --add <url>", "添加订阅链接")
    .option("-r, --remove <url>", "移除订阅链接")
    .option("-l, --list", "显示当前订阅列表")
    .action(async (options) => {
      const msg = ctx.mirai.curMsg as MessageType.GroupMessage;
      const qq = msg.sender.id;
      const groupId = msg.sender.group.id;

      const subscriber = {
        qq,
        groupId,
      };

      if (options.add) {
        const url = options.add;
        const feederItem = await Feeder.findOneAndUpdate(
          {
            url,
          },
          {
            $push: {
              targets: subscriber,
            },
          },
          { upsert: true, new: true }
        );

        subscribe(feederItem);
      }

      if (options.remove) {
        const url = options.remove;

        const feederItem = await Feeder.findOneAndUpdate(
          {
            url,
          },
          {
            $pull: {
              targets: subscriber,
            },
          },
          { upsert: true, new: true }
        );

        unsubscribe(feederItem);
      }

      if (options.list) {
        if (groupId) {
          Feeder.find({
            "targets.groupId": groupId,
          });
        } else {
          Feeder.find({
            "targets.qq": qq,
          });
        }
      }
    });

  feeder.on("new-item", (item) => {
    console.log(item.url);
  });

  /**
   * 订阅
   * @param userFeedConfig
   * @param qq QQ
   * @param groupId 群号
   */
  function subscribe(userFeedConfig: IFeeder) {
    const index = userFeedConfig._id;
    feeder.add({
      url: userFeedConfig.url,
      refresh: userFeedConfig.refresh || 1000,
      eventName: index,
    } as any);

    feeder.on(index, (item) => {
      const content = `${item.title}: ${item.link}`;
      userFeedConfig.targets.forEach((subscriber) => {
        if (subscriber.groupId) {
          ctx.mirai.api.sendGroupMessage(content, subscriber.groupId);
        } else {
          ctx.mirai.api.sendFriendMessage(content, subscriber.qq);
        }
      });
    });
  }

  /**
   * 取消订阅
   * @param userFeedConfig
   */
  function unsubscribe(userFeedConfig: IFeeder) {
    if (userFeedConfig.targets.length) {
      subscribe(userFeedConfig);
    } else {
      feeder.remove(userFeedConfig.url);
    }
  }
}
