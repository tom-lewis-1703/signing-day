// Read-only browser check. Pass this expression to CUA playwright.evaluate.
// Run on the initial review, a school replacement, pool, expanded rooms and drawer.
(() => {
  const rect = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return Object.fromEntries(['x', 'y', 'width', 'height', 'right', 'bottom'].map(k => [k, Math.round(r[k] * 10) / 10]));
  };
  const one = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const width = document.documentElement.clientWidth;
  const workspace = one('.workspace');
  check(!!workspace, 'Review workspace is missing.');
  check(document.documentElement.scrollWidth <= width + 2, `Document overflows horizontally: ${document.documentElement.scrollWidth}px at ${width}px.`);
  const targets = ['.workspace', '.workspace-top', '.summary-strip', '.seed-bar', '.desk', '.school-rail', '#school-list', '#team-sheet', '.team-sheet-head', '.footer-note'];
  const geometry = Object.fromEntries(targets.map(s => [s, rect(one(s))]));
  if (workspace) {
    for (const selector of ['.workspace-top', '.summary-strip', '.seed-bar', '.desk', '.footer-note']) {
      check(one(selector)?.parentElement === workspace, `${selector} must be a direct workspace child.`);
    }
    const desk = one('.desk'), sheet = one('#team-sheet'), rail = one('.school-rail');
    check(sheet?.parentElement === desk, 'School sheet escaped the desk.');
    check(rail?.parentElement === desk, 'School rail escaped the desk.');
    check(!!one('#team-sheet .team-sheet-head h2')?.textContent.trim(), 'Selected content has no visible heading.');
    check(visible(sheet), 'Selected sheet is hidden.');
    check((geometry['.workspace-top']?.height ?? Infinity) < 260, 'Review header is excessively tall.');
    check((geometry['.workspace-top']?.bottom ?? Infinity) <= (geometry['.summary-strip']?.y ?? -1) + 2, 'Summary does not follow the header.');
    if (width >= 1000) {
      check((geometry['#team-sheet']?.width ?? 0) >= Math.min(500, width * .4), 'Selected sheet is squeezed below usable desktop width.');
      check((geometry['.school-rail']?.right ?? Infinity) <= (geometry['#team-sheet']?.x ?? -1) + 2, 'School rail is not beside the selected sheet.');
    }
    check((geometry['.desk']?.right ?? Infinity) <= width + 2, 'Review desk extends outside the viewport.');
  }
  const dialog = one('#player-dialog');
  if (dialog?.open) {
    const d = rect(dialog);
    check(d.x >= -2 && d.right <= width + 2, 'Player drawer extends outside the viewport.');
    check(dialog.scrollWidth <= dialog.clientWidth + 2, 'Player drawer has horizontal overflow.');
    check(!!one('#player-content .close-button'), 'Player drawer has no close control.');
  }
  const spills = all('body *').filter(el => {
    if (!visible(el) || ['SCRIPT', 'STYLE'].includes(el.tagName)) return false;
    const r = el.getBoundingClientRect();
    if (r.right <= width + 2 && r.left >= -2) return false;
    // Content inside an intentional local scroller may extend past its box.
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return false;
    }
    return true;
  }).slice(0, 12).map(el => ({ tag: el.tagName, id: el.id, class: String(el.className), ...rect(el) }));
  return {
    ok: failures.length === 0, failures, viewport: { width, height: innerHeight },
    document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
    geometry, spills,
    state: {
      selected: one('#team-sheet .team-sheet-head h2')?.textContent.trim(),
      activeSchool: one('.school-button.active')?.dataset.team ?? null,
      schoolSearch: one('#school-search')?.value,
      filter: one('.rail-filter .active')?.dataset.filter,
      railScroll: one('#school-list')?.scrollTop,
      poolSearch: one('#pool-search')?.value,
      pagination: one('.pagination')?.textContent.replace(/\s+/g, ' ').trim(),
      openDetails: all('.workspace details[open]').map(el => ({ key:el.dataset.viewKey, summary:el.querySelector(':scope > summary')?.textContent.trim() })),
      scroll: { x: scrollX, y: scrollY },
      drawer: dialog?.open ? { name: one('.player-hero h2')?.textContent, scroll: dialog.scrollTop } : null,
      error: one('#error')?.hidden ? null : one('#error')?.textContent,
      busy: !one('#activity')?.hidden
    }
  };
})()
