import type { Document } from 'mongoose'
import mongoose from 'mongoose'

export interface IGroup extends Document {
  /**
   * 群名
   */
  name: string
  /**
   * 群号
   */
  groupId: number
  /**
   * 是否被封禁
   */
  block?: boolean
}

export const groupSchema = new mongoose.Schema({
  name: String,
  groupId: { type: Number, unique: true },
  block: Boolean,
})

export const Group = mongoose.model<IGroup>('Group', groupSchema)
