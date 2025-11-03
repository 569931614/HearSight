import type { ParseResult } from '../types'

/**
 * 解析 Bilibili URL，提取视频ID
 */
export const parseBilibiliUrl = (input: string): ParseResult => {
  const trimmed = input.trim()
  if (!trimmed) return { error: '请输入链接' }

  if (!/^https?:\/\/(www\.)?bilibili\.com\//i.test(trimmed)) {
    return { error: '仅支持 bilibili.com 域名的链接' }
  }

  const mBV = trimmed.match(/\/video\/(BV[0-9A-Za-z]+)/)
  if (mBV) return { kind: 'BV', id: mBV[1] }

  const mAv = trimmed.match(/\/video\/(av\d+)/)
  if (mAv) return { kind: 'av', id: mAv[1] }

  const mEp = trimmed.match(/\/bangumi\/play\/(ep\d+)/)
  if (mEp) return { kind: 'ep', id: mEp[1] }

  const mSs = trimmed.match(/\/bangumi\/play\/(ss\d+)/)
  if (mSs) return { kind: 'ss', id: mSs[1] }

  const mMd = trimmed.match(/\/bangumi\/media\/(md\d+)/)
  if (mMd) return { kind: 'md', id: mMd[1] }

  return { error: '未能从链接中解析出 BV/av/ep/ss/md 信息，请检查链接是否正确' }
}

/**
 * 格式化时间：接受秒或毫秒为输入，返回 mm:ss 格式
 * @param timeValue - 时间值
 * @param unit - 时间单位，'s' 表示秒，'ms' 表示毫秒。默认根据值大小自动判断
 */
export const formatTime = (timeValue: number, unit?: 's' | 'ms'): string => {
  const num = Math.max(0, Number(timeValue) || 0)

  // 自动判断单位：如果没有指定单位，且值小于 3600（1小时），则视为秒；否则视为毫秒
  let totalSec: number
  if (unit === 's') {
    totalSec = Math.floor(num)
  } else if (unit === 'ms') {
    totalSec = Math.floor(num / 1000)
  } else {
    // 自动判断：如果值 < 3600，很可能是秒；如果 >= 3600，可能是毫秒
    // 但由于后端现在返回秒，我们默认按秒处理
    totalSec = Math.floor(num)
  }

  const m2 = Math.floor(totalSec / 60)
  const s2 = Math.floor(totalSec % 60)
  const mm = String(m2).padStart(2, '0')
  const ss = String(s2).padStart(2, '0')
  return `${mm}:${ss}`
}

/**
 * 视频跳转到指定时间
 */
export const seekVideoTo = (videoElement: HTMLVideoElement | null, timeMs: number): void => {
  const v = videoElement
  if (!v) return
  
  // 统一把传入时间当作毫秒(ms)，转换为秒供 video.currentTime 使用
  let targetMs = Math.max(0, Number(timeMs) || 0)
  let target = targetMs / 1000
  
  // 就绪前先等待元数据，避免设置 currentTime 失败
  if (!isFinite(v.duration) || v.readyState < 1) {
    const handler = () => {
      const dur = isFinite(v.duration) ? v.duration : undefined
      if (dur) target = Math.min(Math.max(0, target), Math.max(0, dur - 0.05))
      if (typeof (v as any).fastSeek === 'function') {
        try { (v as any).fastSeek(target) } catch { v.currentTime = target }
      } else {
        v.currentTime = target
      }
      void v.play()
    }
    v.addEventListener('loadedmetadata', handler, { once: true } as any)
    return
  }
  
  // 元数据已就绪，优先使用 fastSeek
  const dur = isFinite(v.duration) ? v.duration : undefined
  if (dur) target = Math.min(Math.max(0, target), Math.max(0, dur - 0.05))
  if (typeof (v as any).fastSeek === 'function') {
    try { (v as any).fastSeek(target) } catch { v.currentTime = target }
  } else {
    if (Math.abs(v.currentTime - target) > 0.03) {
      v.currentTime = target
    }
  }
  void v.play()
}

/**
 * 从路径中提取文件名
 */
export const extractFilename = (path: string): string => {
  return path.split('\\').pop()?.split('/').pop() || path
}