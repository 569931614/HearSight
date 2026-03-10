import React, { useEffect, useRef, useState } from 'react'
import { Button, Space, Empty, Spin, Alert, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  ReloadOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import { Transformer } from 'markmap-lib'
import { Markmap, loadCSS, loadJS } from 'markmap-view'
import type { MindMapViewerProps } from '../types'

const MindMapViewer: React.FC<MindMapViewerProps> = ({
  markdown,
  loading = false,
  error = null,
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markmapRef = useRef<Markmap | null>(null)
  const [zoomLevel, setZoomLevel] = useState(100)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  // 清理 markdown 内容，去除代码块标记
  const cleanMarkdown = (md: string | null): string | null => {
    if (!md) return md

    // 去除 ```markdown 和 ``` 代码块标记
    let cleaned = md.trim()

    // 匹配 ```markdown 开头和 ``` 结尾
    if (cleaned.startsWith('```markdown') || cleaned.startsWith('```md')) {
      cleaned = cleaned.replace(/^```(?:markdown|md)\s*\n/, '')
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*\n/, '')
    }

    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/\n```\s*$/, '')
    }

    const result = cleaned.trim()
    return result
  }

  // 初始化容器尺寸
  useEffect(() => {
    if (!containerRef.current) return

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          setDimensions({ width: rect.width, height: rect.height })
        }
      }
    }

    // 初始设置
    updateSize()

    // 监听尺寸变化
    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [])

  // 渲染思维导图
  useEffect(() => {
    // 等待尺寸初始化
    if (dimensions.width === 0 || dimensions.height === 0) {
      console.log('Waiting for dimensions to be initialized')
      return
    }

    if (!markdown || !svgRef.current) {
      return
    }

    const svg = svgRef.current
    const cleanedMarkdown = cleanMarkdown(markdown)

    if (!cleanedMarkdown) {
      console.warn('Cleaned markdown is empty')
      return
    }

    try {
      console.log('Starting markmap transformation with dimensions:', dimensions)
      const transformer = new Transformer()
      const { root, features } = transformer.transform(cleanedMarkdown)

      console.log('Markmap transformation successful, loading assets...')
      // 加载必要的资源
      const { styles, scripts } = transformer.getUsedAssets(features)
      if (styles) loadCSS(styles)
      if (scripts) loadJS(scripts, { getMarkmap: () => Markmap })

      console.log('Creating markmap instance...')
      // 销毁旧实例
      if (markmapRef.current) {
        markmapRef.current.destroy?.()
      }

      // 创建新实例
      markmapRef.current = Markmap.create(svg, {
        duration: 300,
        zoom: true,
        pan: true,
      }, root)

      console.log('Fitting markmap to viewport...')
      markmapRef.current.fit()
      setZoomLevel(100)
      console.log('Markmap render complete!')
    } catch (err) {
      console.error('Failed to render mind map:', err)
    }

    // 清理函数
    return () => {
      if (markmapRef.current) {
        markmapRef.current.destroy?.()
        markmapRef.current = null
      }
    }
  }, [markdown, dimensions])

  // 缩放控制
  const handleZoomIn = () => {
    if (markmapRef.current) {
      const newZoom = zoomLevel + 20
      markmapRef.current.rescale(newZoom / 100)
      setZoomLevel(newZoom)
    }
  }

  const handleZoomOut = () => {
    if (markmapRef.current && zoomLevel > 20) {
      const newZoom = Math.max(20, zoomLevel - 20)
      markmapRef.current.rescale(newZoom / 100)
      setZoomLevel(newZoom)
    }
  }

  const handleResetZoom = () => {
    if (markmapRef.current) {
      markmapRef.current.fit()
      setZoomLevel(100)
    }
  }

  // 导出功能
  const exportAsSVG = () => {
    if (!svgRef.current) return

    const svgData = new XMLSerializer().serializeToString(svgRef.current)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'mindmap.svg'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const exportAsPNG = () => {
    if (!svgRef.current) return

    const svgData = new XMLSerializer().serializeToString(svgRef.current)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    // 获取 SVG 尺寸
    const svgRect = svgRef.current.getBoundingClientRect()
    canvas.width = svgRect.width * 2 // 2倍分辨率提高质量
    canvas.height = svgRect.height * 2

    img.onload = () => {
      if (ctx) {
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = 'mindmap.png'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)
          }
        })
      }
    }

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
  }

  const exportMenuItems: MenuProps['items'] = [
    {
      key: 'png',
      label: '导出为 PNG',
      onClick: exportAsPNG,
    },
    {
      key: 'svg',
      label: '导出为 SVG',
      onClick: exportAsSVG,
    },
  ]

  // 加载状态
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        flex: 1,
        background: '#fafafa',
        gap: 16
      }}>
        <Spin size="large">
          <div style={{ padding: 50 }} />
        </Spin>
        <div style={{ color: '#8c8c8c' }}>加载思维导图中...</div>
      </div>
    )
  }

  // 错误状态
  if (error) {
    return (
      <div style={{
        padding: 16,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fafafa'
      }}>
        <Alert
          message="加载失败"
          description={error}
          type="error"
          showIcon
        />
      </div>
    )
  }

  // 无数据状态
  if (!markdown || markdown.trim() === '') {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        flex: 1,
        background: '#fafafa'
      }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="该视频暂无思维导图，请稍后再试"
        />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#fafafa'
      }}
    >
      {/* 工具栏 */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          background: 'rgba(255, 255, 255, 0.95)',
          padding: '8px 12px',
          borderRadius: 4,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        }}
      >
        <Space>
          <Button
            size="small"
            icon={<ZoomInOutlined />}
            onClick={handleZoomIn}
            title="放大"
          />
          <Button
            size="small"
            icon={<ZoomOutOutlined />}
            onClick={handleZoomOut}
            disabled={zoomLevel <= 20}
            title="缩小"
          />
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={handleResetZoom}
            title="重置缩放"
          />
          <span style={{ fontSize: 12, color: '#8c8c8c', margin: '0 4px' }}>
            {zoomLevel}%
          </span>
          <Dropdown menu={{ items: exportMenuItems }} placement="bottomRight">
            <Button
              size="small"
              icon={<DownloadOutlined />}
              title="导出"
            >
              导出
            </Button>
          </Dropdown>
        </Space>
      </div>

      {/* 思维导图容器 */}
      {dimensions.width > 0 && dimensions.height > 0 && (
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          style={{
            cursor: 'grab',
            display: 'block'
          }}
        />
      )}
    </div>
  )
}

export default MindMapViewer
