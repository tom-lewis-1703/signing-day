// Read-only CUA playwright.evaluate expression for the redesigned workspace.
(() => {
  const one = s => document.querySelector(s);
  const all = s => [...document.querySelectorAll(s)];
  const width = document.documentElement.clientWidth;
  const failures = [];
  const check = (value, message) => { if (!value) failures.push(message); };
  const app = one('#app'), workspace = one('.workspace'), dialog = one('#player-dialog');
  const scope = app?.dataset.scope ?? '';
  check(document.documentElement.scrollWidth <= width + 2, 'Document overflows horizontally.');
  check(!!one('.masthead .brand'), 'Workspace identity is missing.');
  check(!!one('main h1'), 'Page heading is missing.');
  check(one('#error')?.hidden, one('#error')?.textContent || 'An operation failed.');
  check(one('#activity')?.hidden, 'An operation is still in progress.');
  if (workspace) {
    check(!!one('.save-strip'), 'Loaded-save context is missing.');
    check(all('.main-nav .nav-link').length === 4, 'Main navigation is incomplete.');
  }
  if (scope.startsWith('dashboard')) {
    check(all('.tool-card').length === 2, 'Dashboard must present both tools.');
    check(!one('.workspace table'), 'Dashboard has reverted to a table.');
  }
  if (scope.startsWith('team')) {
    check(!!one('.school-title h1')?.textContent.trim(), 'School profile heading is missing.');
    check(all('.team-nav-row .tabs button').length === 5, 'School navigation is incomplete.');
    check(!!one('#team-body')?.textContent.trim(), 'School content is missing.');
  }
  if (dialog?.open) {
    const r = dialog.getBoundingClientRect();
    check(r.left >= -2 && r.right <= width + 2, 'Player card extends beyond the viewport.');
    check(dialog.scrollWidth <= dialog.clientWidth + 2, 'Player card has horizontal overflow.');
    check(!!one('.player-hero h2')?.textContent.trim(), 'Player name is missing.');
    check(!!one('#player-content .close-button'), 'Player card has no close control.');
    if (one('.attribute-group')) check(all('.attribute').length === 54, 'Player attribute view is incomplete.');
  }
  for (const grid of all('.tool-grid,.school-grid,.market-player-grid,.rating-grid,.player-grid')) {
    const r = grid.getBoundingClientRect();
    check(r.width > 200, 'A content grid has been squeezed.');
    check(r.right <= width + 2, 'A content grid extends beyond the viewport.');
  }
  return { ok:failures.length === 0, failures, viewport:{width,height:innerHeight},
    document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},
    state:{scope, heading:one('main h1')?.textContent, tab:one('.team-nav-row .tabs .active')?.textContent,
      schoolSearch:one('#dynasty-school-search')?.value, rosterSearch:one('#roster-search')?.value,
      marketSearch:one('#market-search')?.value, ratingsSearch:one('#ratings-search')?.value,
      card:dialog?.open ? one('.player-hero h2')?.textContent : null,
      playerTab:dialog?.open ? one('.player-tabs .active')?.textContent : null,
      openDetails:all('.workspace details[open]').map(d => d.querySelector('summary')?.textContent) } };
})()
