Goal
Make all model pages (Characters, Items, Monsters, Pets, Quests, etc.) use the same UI patterns from blank.css and blank.js.
Reference implementation
blank.css — reference styles
blank.js — reference JavaScript patterns
Components to standardize
Search bar
Separate wrapper (blank-search-wrapper)
Icon inside the input (blank-search-icon)
Styling: gradient background, rounded corners, focus states
CSS classes: blank-search-wrapper, blank-search-bar, blank-search-input, blank-search-icon
Filter bar
Separate from search (blank-filter-wrapper)
Flex layout with filter controls
Each control: label with icon + select dropdown
CSS classes: blank-filter-wrapper, blank-filter-bar, blank-filter-control, blank-filter-label, blank-filter-select
Pagination
Centered pagination container
Buttons with chevron icons for Previous/Next
Ellipsis (...) opens a page jump modal
CSS classes: blank-pagination, pagination-button, pagination-ellipsis
Modal: blank-page-jump-modal-overlay, blank-page-jump-modal
Loading state
Centered overlay with spinner
CSS class: blank-loading-overlay (or model-loading-overlay)
Results info
Shows "Showing X-Y of Z items"
CSS class: blank-results-info
Empty state
Centered message when no results
CSS class: blank-empty-state
Current status
Characters page (characters.js): updated to use the new patterns
Uses model-search-wrapper, model-filter-wrapper, model-pagination
Has the page jump modal
Loading/empty states centered
Other model pages: still need updates
items.js, monsters.js, pets.js, quests.js, starterGear.js, villageShops.js, tokens.js, etc.
CSS architecture
blank.css: reference styles with blank- prefixes
model.css: generic styles with model- prefixes (copied from blank.css)
model-search-wrapper, model-filter-wrapper, model-pagination, etc.
These are the shared classes all model pages should use
Pattern to follow
For each model page (e.g., items.js, monsters.js):
Replace old search/filter HTML with:
   const searchWrapper = createSearchBar(); // or create manually   const filterWrapper = createFilterBar(data);
Use CSS classes:
model-search-wrapper, model-search-bar, model-search-input
model-filter-wrapper, model-filter-bar
model-pagination, blank-pagination (both classes)
model-loading-overlay
blank-empty-state
model-results-info
Implement pagination:
Ellipsis click handler → showPageJumpModal(minPage, maxPage, totalPages)
Buttons with chevron icons (fa-chevron-left, fa-chevron-right)
Match the structure:
Search bar → Filter bar → Results info → Grid → Pagination
Summary
You're creating a consistent UI system where:
blank.css = reference design system
model.css = shared generic styles (copied from blank)
Each model page JS = uses model- prefixed classes and follows the same patterns

- scroll bar for model pages gold/yellow 
- pagination  needs to mimic blank model css styling with clickable elipses and modal for picking a page