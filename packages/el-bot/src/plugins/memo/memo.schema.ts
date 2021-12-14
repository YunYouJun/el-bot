import type { Document } from 'mongoose'
import mongoose from 'mongoose'

export interface IMemo extends Document {
  time: string | Date
  /**
   * 内容
   */
  content: string
  /**
   * 群
   */
  group?: number
  /**
   * 好友
   */
  friend?: number
}

export const memoSchema = new mongoose.Schema({
  time: Date || String,
  content: String,
  group: Number,
  friend: Number,
})

export const Memo = mongoose.model<IMemo>('Memo', memoSchema)
