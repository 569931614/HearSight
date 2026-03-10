# Mind Map Visualization Design

## Overview
This design document outlines the technical approach for adding mind map visualization to the HearSight video platform. The feature will transform AI-generated Markdown content into interactive, visual mind maps that help users understand video content structure.

## Architecture

### Component Hierarchy
```
RightPanel
├── Tabs
│   ├── TabPane: "分句" (Segments)
│   ├── TabPane: "总结" (Summary)
│   └── TabPane: "思维导图" (Mind Map) [NEW]
│       └── MindMapViewer [NEW]
│           ├── MindMapToolbar (zoom, export controls)
│           └── MindMapCanvas (interactive visualization)
```

### Data Flow
```
1. User clicks video → App.tsx fetches video data
2. fetchVideoByVideoId() returns video details including mind_map_markdown
3. RightPanel receives mindMapMarkdown prop
4. MindMapViewer renders Markdown as interactive mind map
5. User interactions (zoom, pan, collapse) update visualization state
6. Export functionality generates PNG/SVG from current view
```

## Technology Choices

### Mind Map Rendering Library
**Selected: markmap-lib + markmap-view**

Rationale:
- Native Markdown support (no need for conversion)
- Built for web with good React integration
- Supports all required features: zoom, pan, collapse/expand
- Active maintenance and good documentation
- MIT license, no commercial restrictions
- Small bundle size (~50KB gzipped)

Alternative considered:
- D3.js mind map (rejected: requires custom implementation, larger effort)
- react-mindmap (rejected: less maintained, limited features)
- vis.js (rejected: overkill for this use case, large bundle)

### State Management
- Use React useState for component-local state (zoom level, collapsed nodes)
- No global state needed (mind map state is view-specific)
- Cache mind map data in API service layer (60s TTL, matching video data cache)

## API Design

### GET /api/qdrant/videos/{video_id}/mindmap
Returns mind map Markdown content for a specific video.

**Response:**
```json
{
  "video_id": "abc123",
  "mind_map_markdown": "# Video Title\n## Main Topic 1\n### Subtopic 1.1\n...",
  "generated_at": "2025-12-13T10:30:00Z",
  "version": "1.0"
}
```

**Error Cases:**
- 404: Video not found
- 404: Mind map not yet generated for this video
- 500: Server error

### PUT /api/qdrant/videos/{video_id}/mindmap
Stores AI-generated mind map content (for future use).

**Request Body:**
```json
{
  "mind_map_markdown": "# Video Title\n## Main Topic 1\n...",
  "version": "1.0"
}
```

## Data Model

### Qdrant Schema Update
Add field to video metadata:
```python
{
  "video_id": "string",
  "video_title": "string",
  # ... existing fields ...
  "mind_map_markdown": "string | null",  # NEW
  "mind_map_generated_at": "timestamp | null"  # NEW
}
```

### Frontend TypeScript Types
```typescript
interface MindMapData {
  video_id: string
  mind_map_markdown: string
  generated_at: string
  version: string
}

interface MindMapViewerProps {
  videoId: string
  markdown: string | null
  loading?: boolean
  error?: string | null
  onExport?: (format: 'png' | 'svg') => void
}
```

## Component Design

### MindMapViewer Component
**Responsibilities:**
- Render Markdown as mind map using markmap library
- Provide zoom controls (in/out/reset buttons)
- Handle pan interactions (drag canvas)
- Manage node collapse/expand state
- Export mind map to PNG/SVG

**Props:**
- `videoId: string` - Current video ID
- `markdown: string | null` - Mind map Markdown content
- `loading?: boolean` - Loading state
- `error?: string | null` - Error message

**State:**
- `zoomLevel: number` - Current zoom (1.0 = 100%)
- `collapsed: Set<string>` - Set of collapsed node IDs
- `exportInProgress: boolean` - Export operation flag

**Key Methods:**
- `handleZoomIn()` - Increase zoom by 20%
- `handleZoomOut()` - Decrease zoom by 20%
- `handleResetZoom()` - Reset to 100%
- `handleNodeClick(nodeId)` - Toggle node collapse state
- `handleExport(format)` - Export to PNG or SVG

### MindMapToolbar Component
A toolbar overlay with controls:
- Zoom In button (ZoomInOutlined icon)
- Zoom Out button (ZoomOutOutlined icon)
- Reset Zoom button (ReloadOutlined icon)
- Export dropdown (DownloadOutlined icon)
  - Export as PNG
  - Export as SVG
- Current zoom level indicator (e.g., "100%")

## Performance Considerations

### Optimization Strategies
1. **Lazy Loading**: Mind map tab uses forceRender=false (load on first view)
2. **Memoization**: Memoize expensive Markdown parsing with useMemo
3. **Throttling**: Throttle zoom/pan events to 60fps max
4. **Caching**: Cache mind map data for 60 seconds to match video cache TTL
5. **Large Maps**: For maps with >100 nodes, default to collapsed state for branches beyond depth 2

### Bundle Size
- markmap-lib: ~30KB gzipped
- markmap-view: ~20KB gzipped
- Total addition: ~50KB (acceptable for this feature)

## Error Handling

### Missing Mind Map Data
When `mind_map_markdown` is null or empty:
```tsx
<Empty
  image={Empty.PRESENTED_IMAGE_SIMPLE}
  description="该视频暂无思维导图，请稍后再试"
/>
```

### API Errors
- Network error: Show retry button with error message
- 404 error: Show "Mind map not available" message
- 500 error: Show generic error with support contact

### Rendering Errors
- Invalid Markdown: Catch parsing errors and show user-friendly message
- Browser compatibility: Detect and warn about unsupported browsers

## Accessibility

### Keyboard Navigation
- Tab to focus on mind map nodes
- Enter/Space to collapse/expand nodes
- Arrow keys to navigate between nodes
- +/- keys for zoom in/out

### Screen Readers
- Add ARIA labels to all controls
- Provide text alternative for mind map structure
- Announce zoom level changes

## Styling

### Visual Design
- Mind map nodes: Use Ant Design color palette
- Connections: Use subtle gray lines (#d9d9d9)
- Active node: Primary color (#1677ff)
- Toolbar: Semi-transparent overlay (rgba(255,255,255,0.9))

### Responsive Behavior
- Desktop: Full RightPanel width and height
- Tablet: Reduce toolbar button sizes, maintain functionality
- Mobile: Consider disabling or simplifying for small screens

## Testing Strategy

### Unit Tests
- Test Markdown parsing edge cases
- Test zoom level calculations
- Test node collapse/expand logic
- Test export functionality

### Integration Tests
- Test RightPanel tab switching with mind map
- Test API integration and error handling
- Test loading and empty states

### E2E Tests
- Test full user flow: open video → view mind map → interact → export
- Test across different browsers
- Test with various Markdown structures

## Migration Strategy

### Phase 1: Frontend Implementation (This Change)
- Add UI components and rendering
- Show "not available" message for videos without mind maps
- No data migration needed

### Phase 2: Backend AI Integration (Future)
- Add AI model for mind map generation
- Process existing videos to generate mind maps
- Queue-based batch processing for large video libraries

### Phase 3: Real-time Generation (Future)
- Generate mind maps during video upload/processing
- WebSocket updates for long-running generations

## Security Considerations

### XSS Prevention
- Sanitize Markdown input before rendering
- Use markmap's built-in XSS protection
- Validate all user inputs in export functionality

### Data Validation
- Validate Markdown structure server-side
- Limit mind map size (max 10MB Markdown content)
- Rate limit mind map generation API endpoints

## Monitoring and Metrics

### Key Metrics to Track
- Mind map view count per video
- Average time spent on mind map tab
- Export usage (PNG vs SVG)
- Error rate for mind map rendering
- Performance: time to render mind maps of various sizes

### Logging
- Log API calls to mind map endpoints
- Log export operations
- Log rendering errors and performance issues

## Open Questions
1. Should mind map generation be automatic for all videos, or on-demand?
   - Recommendation: On-demand initially, automatic after Phase 2
2. Maximum mind map complexity (node count, depth)?
   - Recommendation: 200 nodes max, 5 levels deep
3. Should we support custom mind map editing by users?
   - Recommendation: Not in initial version, consider for future
