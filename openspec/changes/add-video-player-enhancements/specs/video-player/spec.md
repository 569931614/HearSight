## ADDED Requirements

### Requirement: Video Playback Speed Control
The video player SHALL provide users with the ability to adjust playback speed.

#### Scenario: User selects different playback speeds
- **WHEN** user opens the video player
- **THEN** playback speed options (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x) are available
- **AND** the selected speed is applied to the video playback
- **AND** the selected speed is persisted for future sessions

#### Scenario: Speed change during playback
- **WHEN** user changes playback speed while video is playing
- **THEN** the video continues playing at the new speed
- **AND** the playback position is maintained

### Requirement: Full Video Summary Display
The system SHALL display a full video summary in addition to paragraph-level summaries.

#### Scenario: User views video summary
- **WHEN** user opens a video with summaries
- **THEN** a "全文总结" (full summary) tab is available
- **AND** clicking the tab displays the complete video summary
- **AND** the summary is formatted with proper markdown rendering

#### Scenario: No summary available
- **WHEN** video has no summary data
- **THEN** an appropriate empty state is shown
- **AND** user can generate a new summary

### Requirement: Video Folder List Landing Page
The system SHALL display video folders/categories as the default landing page.

#### Scenario: User opens application
- **WHEN** application loads
- **THEN** a folder/category list is displayed by default
- **AND** each folder shows the number of videos it contains
- **AND** clicking a folder displays the videos in that folder

#### Scenario: Folder navigation
- **WHEN** user selects a folder
- **THEN** videos in that folder are displayed
- **AND** user can navigate back to folder list
- **AND** folder hierarchy (if nested) is navigable
