# Implementation Tasks

## Backend Tasks

- [x] Add mind map field to video metadata structure
  - Update Qdrant schema to include `mind_map_markdown` field
  - Add migration or update script if needed

- [x] Create API endpoint for mind map data
  - Add `GET /api/qdrant/videos/{video_id}/mindmap` endpoint
  - Return mind map markdown content with appropriate error handling
  - Add `PUT /api/qdrant/videos/{video_id}/mindmap` endpoint for future AI generation

- [x] Update video details endpoint
  - Include mind map availability flag in video metadata response
  - Ensure consistent error handling when mind map data is missing

## Frontend Tasks

- [x] Install mind map visualization library
  - Research and select appropriate library (markmap-lib + markmap-view recommended)
  - Add dependencies to package.json
  - Test library compatibility with React and TypeScript

- [x] Create MindMapViewer component
  - Implement basic mind map rendering from Markdown
  - Add zoom controls (zoom in, zoom out, reset)
  - Implement pan functionality (drag to move)
  - Add node collapse/expand interaction
  - Implement export functionality (PNG/SVG)
  - Add loading and error states
  - Style component to match existing UI theme

- [x] Update RightPanel component
  - Add new "思维导图" tab to Tabs component
  - Integrate MindMapViewer component in new tab pane
  - Pass video_id and mind map data as props
  - Handle empty/missing mind map data with appropriate message

- [x] Add mind map API service methods
  - Create `fetchVideoMindMap(videoId)` in api.ts
  - Add error handling and loading states
  - Implement caching strategy for mind map data

- [x] Update TypeScript types
  - Add MindMap interface in types/index.ts
  - Update VideoDetail type to include optional mindMapMarkdown field
  - Add types for MindMapViewer props

- [x] Add CSS styling
  - Style mind map container for proper sizing and layout
  - Add styles for zoom controls and toolbar
  - Ensure responsive design for different screen sizes
  - Match existing theme colors and spacing

## Testing Tasks

- [x] Test mind map rendering
  - Test with various Markdown structures (simple, nested, complex)
  - Verify proper rendering of Chinese characters
  - Test performance with large mind maps

- [x] Test interactive features
  - Verify zoom in/out functionality
  - Test pan/drag behavior
  - Verify node collapse/expand works correctly
  - Test export to PNG and SVG formats

- [x] Test error handling
  - Verify behavior when mind map data is unavailable
  - Test API error scenarios
  - Verify loading states display correctly

- [ ] Cross-browser testing
  - Test in Chrome, Firefox, Safari
  - Verify touch gestures work on mobile devices

## Documentation Tasks

- [ ] Update component documentation
  - Document MindMapViewer props and usage
  - Add examples of mind map Markdown format

- [ ] Update API documentation
  - Document new mind map endpoints
  - Provide example requests and responses

## Future Enhancements (Not in This Change)
- AI model integration for automatic mind map generation
- Real-time mind map updates during video processing
- Custom mind map themes and styling options
- Node search and filtering functionality
