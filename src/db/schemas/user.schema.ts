import mongoose, { Document } from "mongoose";

export interface IUser extends Document {
  /**
   * 备注姓名
   */
  name: string;
  /**
   * 触发者 QQ
   */
  qq: number;
  /**
   * 总计触发次数
   */
  total: number;
  /**
   * 上次触发时间
   */
  lastTriggerTime: Date;
  /**
   * 是否被封禁
   */
  block?: boolean;
}

export const userSchema = new mongoose.Schema({
  name: String,
  qq: { type: String, unique: true },
  total: Number,
  lastTriggerTime: Date,
  block: Boolean,
});

export const User = mongoose.model<IUser>("User", userSchema);
