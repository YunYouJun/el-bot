import { Friend } from "../../db/schemas/friend.schema";
// import mongoose from "mongoose";
// const Friend = mongoose.models.Friend;
import { Group } from "../../db/schemas/group.schema";

type BlockType = "qq" | "user" | "friend" | "group";

const blacklist = {
  friends: new Set<number>(),
  groups: new Set<number>(),
};

/**
 * 初始化黑名单
 * 同步维护 减少查询
 */
export async function initBlacklist() {
  const blockedFriends = await Friend.find({
    block: true,
  });
  const blockedGroups = await Group.find({
    block: true,
  });

  blockedFriends.forEach((friend) => {
    blacklist.friends.add(friend.qq);
  });
  blockedGroups.forEach((group) => {
    blacklist.groups.add(group.groupId);
  });

  return blacklist;
}

export function displayList(blacklist: Set<number>) {
  let content = "";
  blacklist.forEach((qq) => {
    content += `\n- ${qq}`;
  });
  return content;
}

const friendAlias = ["user", "qq", "friend"];

/**
 * 封禁
 * @param type 类型
 * @param id
 */
export async function block(type: BlockType, id: number) {
  if (!Number.isInteger(id)) return false;
  if (friendAlias.includes(type)) {
    await blockFriend(id);
    return true;
  } else if (type === "group") {
    await blockGroup(id);
    return true;
  }
}

/**
 * 解封
 * @param type 类型
 * @param id
 */
export async function unBlock(type: BlockType, id: number) {
  if (!Number.isInteger(id)) return false;
  if (friendAlias.includes(type)) {
    await unBlockFriend(id);
    return true;
  } else if (type === "group") {
    await unBlockGroup(id);
    return true;
  }
}

export async function blockGroup(groupId: number) {
  await Group.updateOne(
    {
      groupId,
    },
    {
      $set: {
        block: true,
      },
    },
    {
      upsert: true,
    }
  );
  blacklist.groups.add(groupId);
}

export async function unBlockGroup(groupId: number) {
  await Group.updateOne(
    {
      groupId,
    },
    {
      $set: {
        block: false,
      },
    },
    {
      upsert: true,
    }
  );
  blacklist.groups.delete(groupId);
}

export async function blockFriend(qq: number) {
  await Friend.updateOne(
    {
      qq,
    },
    {
      $set: {
        block: true,
      },
    },
    {
      upsert: true,
    }
  );
  blacklist.friends.add(qq);
}

export async function unBlockFriend(qq: number) {
  await Friend.updateOne(
    {
      qq,
    },
    {
      $set: {
        block: false,
      },
    },
    {
      upsert: true,
    }
  );
  blacklist.friends.delete(qq);
}
