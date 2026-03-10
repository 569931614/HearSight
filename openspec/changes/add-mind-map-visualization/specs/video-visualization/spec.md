# video-visualization

## ADDED Requirements

### Requirement: Mind Map Tab Display
The system SHALL display a "思维导图" (Mind Map) tab in the video right panel alongside existing "分句" and "总结" tabs.

**Priority:** High
**Category:** User Interface

#### Scenario: User views mind map tab
- **Given** a video is open in the modal player
- **And** the right panel is visible
- **When** the user looks at the tab bar
- **Then** they see three tabs: "分句（点击跳转）", "总结", and "思维导图"
- **And** the mind map tab appears after the summary tab

#### Scenario: User switches to mind map tab
- **Given** a video is open with mind map data available
- **When** the user clicks on the "思维导图" tab
- **Then** the tab content switches to show the mind map visualization
- **And** the mind map renders within 2 seconds for typical content
- **And** other tabs remain accessible for switching back

---

### Requirement: Mind Map Rendering from Markdown
The system SHALL render mind maps from Markdown-formatted text using a visualization library.

**Priority:** High
**Category:** Data Visualization

#### Scenario: Render simple mind map
- **Given** mind map Markdown content with 2 levels: "# Main Topic\n## Subtopic 1\n## Subtopic 2"
- **When** the MindMapViewer component receives this content
- **Then** a mind map is displayed with one root node and two child nodes
- **And** node hierarchy matches the Markdown heading levels
- **And** Chinese characters render correctly

#### Scenario: Render complex nested mind map
- **Given** mind map Markdown with 4 levels of nesting and 20 nodes
- **When** the MindMapViewer renders this content
- **Then** all nodes are displayed in correct hierarchical structure
- **And** the visualization is readable without overlap
- **And** rendering completes within 3 seconds

#### Scenario: Handle empty mind map data
- **Given** a video with no mind map data available
- **When** the user opens the mind map tab
- **Then** an Empty component displays with message "该视频暂无思维导图，请稍后再试"
- **And** no error is thrown

---

### Requirement: Zoom and Pan Controls
The system SHALL support zooming in/out and panning to navigate large mind maps.

**Priority:** High
**Category:** Interaction

#### Scenario: Zoom in with button
- **Given** a mind map is displayed at 100% zoom
- **When** the user clicks the zoom in button
- **Then** the zoom level increases to 120%
- **And** the zoom percentage indicator updates to show "120%"
- **And** the mind map scales smoothly with animation

#### Scenario: Zoom out with button
- **Given** a mind map is displayed at 100% zoom
- **When** the user clicks the zoom out button
- **Then** the zoom level decreases to 80%
- **And** the zoom percentage updates accordingly
- **And** the zoom out button disables if zoom reaches minimum (20%)

#### Scenario: Reset zoom
- **Given** a mind map is displayed at 150% zoom
- **When** the user clicks the reset zoom button
- **Then** the zoom level returns to 100%
- **And** the mind map centers in the viewport

#### Scenario: Zoom with mouse wheel
- **Given** a mind map is displayed
- **And** the user's cursor is over the mind map area
- **When** the user scrolls the mouse wheel up
- **Then** the zoom level increases by 10% per scroll tick
- **And** zoom centers on the cursor position

#### Scenario: Pan by dragging
- **Given** a mind map is displayed that extends beyond viewport
- **When** the user clicks and drags on the canvas
- **Then** the mind map moves in the direction of the drag
- **And** the cursor changes to indicate drag mode
- **And** panning is smooth without lag (60fps)

---

### Requirement: Node Collapse and Expand
The system SHALL allow users to collapse and expand mind map nodes to manage complexity.

**Priority:** Medium
**Category:** Interaction

#### Scenario: Collapse node with children
- **Given** a mind map with a node that has 3 child nodes
- **And** all children are currently visible
- **When** the user clicks on the parent node
- **Then** the child nodes collapse and become hidden
- **And** a visual indicator (e.g., "+" icon) shows the node is collapsed
- **And** the collapse animation is smooth

#### Scenario: Expand collapsed node
- **Given** a mind map with a collapsed node
- **When** the user clicks on the collapsed node
- **Then** the child nodes expand and become visible
- **And** the visual indicator changes to show expanded state (e.g., "-" icon)
- **And** the expansion animation is smooth

#### Scenario: Collapse multiple branches
- **Given** a complex mind map with multiple branches
- **When** the user collapses several parent nodes
- **Then** each collapsed branch hides its children independently
- **And** the collapsed state persists while navigating within the tab
- **And** switching away and back to the tab resets collapse state to default

---

### Requirement: Export Mind Map
The system SHALL allow users to export mind maps as PNG or SVG images.

**Priority:** Medium
**Category:** Data Export

#### Scenario: Export as PNG
- **Given** a mind map is displayed
- **When** the user clicks the export button and selects "Export as PNG"
- **Then** the browser downloads a PNG file of the current mind map view
- **And** the PNG includes all visible nodes at current zoom level
- **And** the filename is "{video_title}_mindmap.png"
- **And** the export completes within 5 seconds

#### Scenario: Export as SVG
- **Given** a mind map is displayed
- **When** the user clicks the export button and selects "Export as SVG"
- **Then** the browser downloads an SVG file of the mind map
- **And** the SVG is vector-based and scalable
- **And** the filename is "{video_title}_mindmap.svg"

#### Scenario: Export during zoom
- **Given** a mind map is zoomed to 150%
- **When** the user exports to PNG
- **Then** the exported image reflects the 150% zoom level
- **And** image quality is high without pixelation

---

### Requirement: Mind Map Data Fetching
The system SHALL fetch mind map data from the backend API and handle loading/error states.

**Priority:** High
**Category:** Data Management

#### Scenario: Fetch mind map successfully
- **Given** a video with ID "abc123" has mind map data
- **When** the RightPanel component mounts
- **Then** it calls GET /api/qdrant/videos/abc123/mindmap
- **And** the mind map data is retrieved and passed to MindMapViewer
- **And** a loading spinner shows during the fetch

#### Scenario: Handle missing mind map data
- **Given** a video with ID "xyz789" has no mind map data
- **When** the API returns 404 Not Found
- **Then** the MindMapViewer displays an Empty state
- **And** the message reads "该视频暂无思维导图，请稍后再试"
- **And** no error toast or alert is shown

#### Scenario: Handle API error
- **Given** the mind map API endpoint returns 500 Server Error
- **When** the fetch request fails
- **Then** an error message displays in the mind map tab
- **And** a retry button is provided
- **And** clicking retry re-fetches the mind map data

#### Scenario: Cache mind map data
- **Given** mind map data for video "abc123" was fetched 30 seconds ago
- **When** the user switches to another video and back to "abc123"
- **Then** the cached mind map data is used
- **And** no new API request is made if cache is still valid (60s TTL)
- **And** a new request is made if cache is expired

---

### Requirement: Responsive and Accessible Mind Map
The system SHALL ensure mind maps are accessible and work on different screen sizes.

**Priority:** Medium
**Category:** Accessibility

#### Scenario: Keyboard navigation
- **Given** a mind map is displayed and user is using keyboard
- **When** the user presses Tab key
- **Then** focus moves to the next interactive element (zoom buttons, nodes)
- **And** focused elements have visible focus indicator

#### Scenario: Keyboard zoom control
- **Given** a mind map is focused
- **When** the user presses "+" key
- **Then** the mind map zooms in by 20%
- **When** the user presses "-" key
- **Then** the mind map zooms out by 20%

#### Scenario: Screen reader support
- **Given** a screen reader is active
- **When** the mind map tab is selected
- **Then** the screen reader announces "思维导图 tab selected"
- **And** zoom level changes are announced (e.g., "Zoom level 120%")

#### Scenario: Responsive on tablet
- **Given** the app is viewed on a tablet (768px width)
- **When** the mind map tab is opened
- **Then** the mind map scales to fit the available width
- **And** touch gestures work for pan (two-finger drag)
- **And** pinch-to-zoom works for zoom control
