# Video Player and UI Enhancements

## Why
Users need better control over video playback, access to full video summaries, and an organized way to browse video content by categories. Currently:
1. Video playback speed is fixed, limiting user control
2. Video summaries only show paragraph-level summaries, not the overall video summary
3. Users see a list of videos immediately without categorization on the landing page

## What Changes
- Add playback speed control to video player (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x)
- Display full video summary in addition to paragraph summaries in the RightPanel
- Implement a folder/category list view as the default landing page

## Impact
- Affected specs: video-player, video-browsing, video-summary
- Affected code:
  - Frontend: `frontend/src/components/VideoPlayer.tsx` (playback speed)
  - Frontend: `frontend/src/components/RightPanel.tsx` (full video summary display)
  - Frontend: `frontend/src/components/LeftPanel.tsx` (folder list view)
  - Frontend: `frontend/src/App.tsx` (landing page state management)
  - Backend: `backend/routers/*.py` (may need new API endpoint for categories/folders)
