/**
 * 自然排序工具函数
 * 支持数字按数值大小排序、版本号排序、中文数字混合等
 */

// 中文数字映射
const chineseNumbers: Record<string, number> = {
  '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  '十': 10, '百': 100, '千': 1000, '万': 10000,
  '〇': 0, '壹': 1, '贰': 2, '叁': 3, '肆': 4,
  '伍': 5, '陆': 6, '柒': 7, '捌': 8, '玖': 9,
  '拾': 10
}

/**
 * 将字符串分割为数字和非数字部分
 */
const splitStringIntoChunks = (str: string): Array<string | number> => {
  // 转为小写，不区分大小写
  const lowerStr = str.toLowerCase()
  const chunks: Array<string | number> = []

  // 正则：匹配连续的数字、中文数字、或非数字字符
  const regex = /(\d+)|([一二三四五六七八九十百千万零〇壹贰叁肆伍陆柒捌玖拾]+)|([^\d一二三四五六七八九十百千万零〇壹贰叁肆伍陆柒捌玖拾]+)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(lowerStr)) !== null) {
    if (match[1]) {
      // 阿拉伯数字
      chunks.push(parseInt(match[1], 10))
    } else if (match[2]) {
      // 中文数字
      const chineseNum = parseChineseNumber(match[2])
      chunks.push(chineseNum)
    } else if (match[3]) {
      // 非数字字符串
      chunks.push(match[3])
    }
  }

  return chunks
}

/**
 * 解析中文数字为阿拉伯数字
 * 例如：十五 -> 15, 一百二十三 -> 123
 */
const parseChineseNumber = (str: string): number => {
  let result = 0
  let temp = 0
  let multiplier = 1

  for (let i = str.length - 1; i >= 0; i--) {
    const char = str[i]
    const value = chineseNumbers[char]

    if (value === undefined) {
      continue
    }

    if (value >= 10) {
      // 遇到十、百、千、万等单位
      if (value > multiplier) {
        multiplier = value
        if (temp === 0) {
          temp = 1
        }
      }
    } else {
      temp += value * multiplier
    }
  }

  result = temp
  return result > 0 ? result : 0
}

/**
 * 比较两个 chunk 数组
 */
const compareChunks = (chunksA: Array<string | number>, chunksB: Array<string | number>): number => {
  const maxLength = Math.max(chunksA.length, chunksB.length)

  for (let i = 0; i < maxLength; i++) {
    const chunkA = chunksA[i]
    const chunkB = chunksB[i]

    // 如果其中一个已经没有更多的 chunk，则较短的排在前面
    if (chunkA === undefined) return -1
    if (chunkB === undefined) return 1

    const isNumberA = typeof chunkA === 'number'
    const isNumberB = typeof chunkB === 'number'

    // 如果类型不同，数字排在字符串前面
    if (isNumberA && !isNumberB) return -1
    if (!isNumberA && isNumberB) return 1

    // 如果都是数字，直接比较数值
    if (isNumberA && isNumberB) {
      if (chunkA !== chunkB) {
        return (chunkA as number) - (chunkB as number)
      }
    }

    // 如果都是字符串，按字典序比较
    if (!isNumberA && !isNumberB) {
      const strA = chunkA as string
      const strB = chunkB as string
      if (strA !== strB) {
        return strA.localeCompare(strB, 'zh-CN')
      }
    }
  }

  return 0
}

/**
 * 自然排序比较函数
 * @param a - 第一个字符串
 * @param b - 第二个字符串
 * @returns 负数表示 a < b，正数表示 a > b，0 表示相等
 */
export const naturalSort = (a: string, b: string): number => {
  // 空值处理
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1

  const chunksA = splitStringIntoChunks(a)
  const chunksB = splitStringIntoChunks(b)

  return compareChunks(chunksA, chunksB)
}

/**
 * 对视频列表进行自然排序
 * @param videos - 视频列表
 * @param sortKey - 排序字段，默认为 'video_title'
 * @returns 排序后的视频列表
 */
export const sortVideosNaturally = <T extends Record<string, any>>(
  videos: T[],
  sortKey: keyof T = 'video_title' as keyof T
): T[] => {
  return [...videos].sort((a, b) => {
    const valueA = a[sortKey] as string
    const valueB = b[sortKey] as string
    return naturalSort(valueA, valueB)
  })
}

/**
 * 测试用例（可在控制台运行）
 */
export const testNaturalSort = () => {
  const testCases = [
    'video1.mp4',
    'video10.mp4',
    'video2.mp4',
    'video20.mp4',
    'Video3.mp4',
    'VIDEO11.mp4',
    '第一集.mp4',
    '第十集.mp4',
    '第二集.mp4',
    '第二十集.mp4',
    'v1.0.1',
    'v1.0.10',
    'v1.0.2',
    'v1.10.0',
    'v1.2.0',
    '教程-第1课',
    '教程-第10课',
    '教程-第2课',
  ]

  console.log('Original:', testCases)
  console.log('Sorted:', [...testCases].sort(naturalSort))
}
