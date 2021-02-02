import { User } from "../../db/schemas/user.schema";
import { Group } from "../../db/schemas/group.schema";

type BlockType = "qq" | "user" | "group";

const blacklist = {
  users: new Set<number>(),
  groups: new Set<number>(),
};

/**
 * 初始化黑名单
 * 同步维护 减少查询
 */
export async function initBlacklist() {
  const blockedUsers = await User.find({
    block: true,
  });
  const blockedGroups = await Group.find({
    block: true,
  });

  blockedUsers.forEach((user) => {
    blacklist.users.add(user.qq);
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

/**
 * 封禁
 * @param type 类型
 * @param id
 */
export async function block(type: BlockType, id: number) {
  if (!Number.isInteger(id)) return false;
  if (["user", "qq"].includes(type)) {
    await blockUser(id);
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
  if (["user", "qq"].includes(type)) {
    await unBlockUser(id);
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

export async function blockUser(qq: number) {
  await User.updateOne(
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
  blacklist.users.add(qq);
}

export async function unBlockUser(qq: number) {
  await User.updateOne(
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
  blacklist.users.delete(qq);
}
