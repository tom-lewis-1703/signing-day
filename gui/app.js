import { createViews } from './views.js';
const $ = selector => document.querySelector(selector);
const app = $('#app');
const dialog = $('#player-dialog');
const ui = { saves: [], opened: null, dynasty: null, view: 'welcome', teamData: null, teamTab: 'overview', schoolSearch: '', schoolSort: 'name', rosterBasis: 'current', rosterSearch: '', marketTab: 'moves', marketSearch: '', marketPage: 0, playerTab: 'profile', plan: null, ratings: null, ratingsTeam: null, ratingsSearch: '', selected: null, busy: false, card: null, disclosures: new Map(), playerRequest: 0, playerAbort: null };
let portraitGeneration = 0;
const portraitCache = new Map();
const portraitObserver = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    portraitObserver.unobserve(entry.target);
    loadPortrait(entry.target);
  }
}, { rootMargin: '160px' });
async function loadPortrait(target) {
  const index = Number(target.dataset.portraitPlayer), generation = portraitGeneration;
  if (!portraitCache.has(index)) portraitCache.set(index, api('/api/player?index=' + index).then(card => card.portrait).catch(() => null));
  const portrait = await portraitCache.get(index);
  if (!target.isConnected || generation !== portraitGeneration || !portrait?.src || portrait.blank) return;
  const image = document.createElement('img');
  image.className = 'player-photo'; image.alt = ''; image.loading = 'lazy';
  image.src = '/' + portrait.src.replace(/^\//, '');
  target.replaceChildren(image);
}
const html = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const number = value => Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—';
const finite = value => value !== null && value !== undefined && Number.isFinite(Number(value));
const human = value => String(value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, x => x.toUpperCase());
const teamLabel = value => value == null ? 'Unplaced' : typeof value === 'object' ? value.name ?? value.team ?? String(value.index ?? '') : String(value);
const valueText = value => value == null ? '—' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : typeof value === 'number' ? number(value) : typeof value === 'object' ? JSON.stringify(value) : String(value);
const initials = name => String(name || '').split(/\s+/).map(x => x[0]).slice(0, 3).join('').toUpperCase();
const logo = (team, extra = '') => team?.logo ? `<img class="team-logo ${extra}" src="/${html(String(team.logo).replace(/^\//, ''))}" alt="" onerror="this.style.visibility='hidden'">` : `<span class="logo-fallback ${extra}">${html(team?.short || initials(team?.name))}</span>`;
const dateText = stamp => { const d = new Date(stamp); return Number.isNaN(d.valueOf()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const percent = value => finite(value) ? `${number(value * 100)}%` : '—';
const signed = value => finite(value) ? `${Number(value) > 0 ? '+' : ''}${number(value)}` : '—';
const schoolName = index => ui.dynasty?.teams.find(t => t.index === index)?.name ?? ui.plan?.teams.find(t => t.index === index)?.name ?? (ui.plan?.userTeam?.index === index ? ui.plan.userTeam.name : 'Unplaced');
const factGrid = rows => `<div class="facts-grid">${rows.map(([label, value]) => `<div class="fact"><label>${html(label)}</label><span>${html(valueText(value))}</span></div>`).join('')}</div>`;
const playerLink = (index, name) => `<button class="player-link" data-action="player" data-player="${index}">${html(name)}</button>`;
const schoolLink = (index, name) => `<button class="player-link" data-action="select-team" data-team="${index}">${html(name || schoolName(index))}</button>`;
function nameForPlayer(index) {
  const moved = ui.plan?.teams.flatMap(t => [...t.in, ...t.out, ...t.kept]).find(p => p.playerIndex === index) || ui.plan?.unplaced.find(p => p.playerIndex === index);
  return moved?.name ?? `Player ${index}`;
}

// Each renderer owns a balanced fragment. Tables scroll locally rather than widening the page.
function setContent(element, markup) {
  element.innerHTML = markup;
  element.querySelectorAll('table').forEach(table => {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    table.before(wrapper);
    wrapper.append(table);
  });
  portraitObserver.disconnect();
  document.querySelectorAll('[data-portrait-player]').forEach(target => portraitObserver.observe(target));
}

function disclosureKey(element) {
  const key = element.dataset.viewKey;
  return key ? `${app.dataset.scope || ui.view}:${key}` : null;
}
function rememberDisclosures() {
  app.querySelectorAll('details[data-view-key]').forEach(element => ui.disclosures.set(disclosureKey(element), element.open));
}
function restoreDisclosures() {
  app.querySelectorAll('details[data-view-key]').forEach(element => {
    const key = disclosureKey(element);
    if (ui.disclosures.has(key)) element.open = ui.disclosures.get(key);
  });
}
function resetReview() {
  closePlayer();
  portraitGeneration++;
  portraitCache.clear();
  portraitObserver.disconnect();
  Object.assign(ui, { dynasty: null, teamData: null, view: 'welcome',
    teamTab: 'overview', schoolSearch: '', schoolSort: 'name', rosterSearch: '', rosterBasis: 'current',
    marketTab: 'moves', marketSearch: '', marketPage: 0, playerTab: 'profile',
    plan: null, ratings: null, ratingsTeam: null, ratingsSearch: '', selected: null });
  ui.disclosures.clear();
  app.replaceChildren();
  app.dataset.scope = '';
}
function closePlayer() {
  ui.playerRequest++;
  ui.playerAbort?.abort();
  ui.card = null;
  if (dialog.open) dialog.close();
}

async function api(path, body, options = {}) {
  const response = await fetch(path, { ...options, ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || data.failed?.join('\n') || 'The action could not be completed.');
  return data;
}

function error(message) {
  const el = $('#error'); el.textContent = message || ''; el.hidden = !message;
  $('#drawer-error')?.remove();
  if (message && dialog.open) {
    const inline = document.createElement('div');
    inline.id = 'drawer-error'; inline.className = 'error-banner'; inline.setAttribute('role', 'alert'); inline.textContent = message;
    $('.drawer-top').after(inline);
    dialog.scrollTop = 0;
  } else if (message) el.scrollIntoView({ block: 'nearest' });
}
function toast(message) { const el = $('#toast'); el.textContent = message; el.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, 4200); }
function setBusy(busy, message = 'Working…') {
  ui.busy = busy; $('#activity').hidden = !busy; $('#activity-text').textContent = message;
  $('#drawer-activity')?.remove();
  if (busy && dialog.open) {
    const status = document.createElement('div');
    status.id = 'drawer-activity'; status.className = 'drawer-status'; status.setAttribute('role', 'status'); status.textContent = message;
    $('.drawer-top').after(status);
    dialog.scrollTop = 0;
  }
  document.querySelectorAll('button, input, select').forEach(el => {
    if (el.dataset.action === 'close-player') return;
    if (busy) { el.dataset.wasDisabled = el.disabled ? 'yes' : 'no'; el.disabled = true; }
    else if ('wasDisabled' in el.dataset) { el.disabled = el.dataset.wasDisabled === 'yes'; delete el.dataset.wasDisabled; }
  });
}
async function work(message, fn) {
  if (ui.busy) return;
  error(''); setBusy(true, message);
  try { await fn(); } catch (e) { error(e.message); } finally { setBusy(false); }
}

function renderWelcome(saved = null) { ui.view = 'welcome'; show(views.welcome(saved)); }

const stageLabel = label => String(label || '').replace(/ \((?:no action at this stage|not an offseason stage|not one the tool handles)\)$/, '');
const views = createViews({ ui, html, number, logo, playerLink, schoolLink, stageLabel,
  leagueReview, renderWarnings, renderChanges, keptSection, roomDetails, ratingsDetail,
  decisionSection, releaseSection, vetoSection, alternativesSection, forecastSection, simulationSection,
  competitorSection, factGrid });
function shell() { $('.masthead').innerHTML = views.masthead(); }
function show(markup) { rememberDisclosures(); setContent(app, markup); app.dataset.scope = ui.view + ':' + (ui.view === 'team' ? ui.selected : 'all'); restoreDisclosures(); shell(); }
function renderDashboard() { ui.view = 'dashboard'; show(views.dashboard()); }
function renderSchools() { ui.view = 'schools'; show(views.schools()); }
function renderTeamPage() { ui.view = 'team'; show(views.team()); }
async function openTeam(index, preserve = false, record = true) {
  closePlayer();
  const data = await api('/api/team?index=' + encodeURIComponent(index));
  if (!preserve && ui.selected !== index) { ui.teamTab = 'overview'; ui.rosterSearch = ''; ui.rosterBasis = 'current'; }
  ui.teamData = data; ui.selected = index; renderTeamPage(); if (record) rememberRoute('team', index); window.scrollTo(0, 0);
}
function navigate(view, record = true) {
  closePlayer(); error('');
  if (view === 'dashboard') renderDashboard();
  if (view === 'schools') renderSchools();
  if (view === 'transfers') renderPlan();
  if (view === 'ratings') renderRatings();
  if (record) rememberRoute(view);
  window.scrollTo(0, 0);
}
async function runTool(tool) {
  const result = await api('/api/tool', { tool });
  closePlayer();
  if (tool === 'transfers') { ui.ratings = null; ui.plan = result; ui.view = 'transfers'; renderPlan(); }
  else { ui.plan = null; ui.ratings = result; ui.ratingsTeam = null; renderRatings(); }
  ui.teamData = null; window.scrollTo(0, 0);
}

function rememberRoute(view, team = null) {
  const state = { view, team, save: ui.dynasty?.save.fileName };
  const hash = view === 'team' ? '#school/' + team : '#' + view;
  if (location.hash !== hash) history.pushState(state, '', hash);
}
window.addEventListener('popstate', event => {
  if (!ui.dynasty || ui.busy) return;
  const route = event.state;
  if (!route || route.save !== ui.dynasty.save.fileName) return navigate('dashboard', false);
  if (route.view === 'team') work('Loading school…', () => openTeam(route.team, false, false));
  else navigate(route.view, false);
});
function renderTeamPicker() { ui.view = 'picker'; show(views.picker()); }

async function acceptPlan(plan) {
  const y = window.scrollY;
  ui.plan = plan; closePlayer();
  if (ui.view === 'team' && ui.teamData) {
    ui.teamData = await api('/api/team?index=' + ui.teamData.index); renderTeamPage();
  } else renderPlan();
  window.scrollTo(0, y);
}

function renderPlan() { ui.view = 'transfers'; show(views.market()); }

function ratingChange(team, key) {
  const delta = team.after[key] - team.before[key];
  return `<span class="muted">${number(team.before[key])} →</span> <strong>${number(team.after[key])}</strong>${delta ? ` <small class="${delta > 0 ? 'positive' : 'negative'}">${signed(delta)}</small>` : ''}`;
}
function ratingsDetail() {
  const t = ui.ratings.teams.find(t => t.index === ui.ratingsTeam);
  if (!t) return '<div class="empty">Select a team to see the calculation.</div>';
  return `<div class="team-sheet-head"><div class="team-sheet-title"><div class="eyebrow">RATING BREAKDOWN</div><h2>${html(t.name)}</h2><p>${number(t.rosterCount)} eligible players · ${ui.ratings.rosterBasis === 'upcoming' ? 'Upcoming roster' : 'Current roster'}</p></div></div>
    <div class="team-metrics">${['overall', 'offense', 'defense'].map(key => `<div class="team-metric"><label>${human(key)}</label><span>${ratingChange(t, key)}</span></div>`).join('')}</div>
    ${t.note ? `<p class="team-note">${html(t.note)} Stored ratings will be kept.</p>` : Object.entries(t.breakdown).map(([side, rooms]) => `<div class="move-section"><div class="move-title"><h3>${human(side)}</h3><p>80% starters + 20% backups</p></div><table class="rating-room-table"><thead><tr><th>Room / weight</th><th>Starters</th><th>Backups</th><th>Score</th></tr></thead><tbody>${rooms.map(room => `<tr><td><strong>${html(room.room)}</strong><span class="muted"> ×${room.weight}</span></td><td><strong class="num">${number(room.starterAverage)}</strong><span class="rating-player-list">${room.starters.map(p => `${playerLink(p.index, p.name)} · ${p.overall}`).join('<br>')}${room.missingStarters ? `<br><span class="negative">${room.missingStarters} empty × 40</span>` : ''}</span></td><td><strong class="num">${number(room.backupAverage)}</strong><span class="rating-player-list">${room.backups.map(p => `${playerLink(p.index, p.name)} · ${p.overall}`).join('<br>')}${room.missingBackups ? `<br><span class="negative">${room.missingBackups} empty × 40</span>` : ''}</span></td><td class="number-cell">${number(room.score)}</td></tr>`).join('')}</tbody></table></div>`).join('')}
    ${t.schemeFallback ? '<p class="team-note">An unknown scheme uses the standard starter counts.</p>' : ''}`;
}
function renderRatings() { ui.view = 'ratings'; show(views.ratings()); }

function renderWarnings(warnings = []) {
  if (!warnings.length) return '';
  return `<details class="notice" data-view-key="warnings"><summary>${warnings.length} ${warnings.length === 1 ? 'exception' : 'exceptions'} & model notes to review</summary><ul>${warnings.map(w => `<li>${html(typeof w === 'string' ? w : w.message || valueText(w))}</li>`).join('')}</ul></details>`;
}
function leagueReview(p) {
  const c = p.inputCounts || {}, d = p.diagnostics || {}, s = p.summary || {};
  const changes = d.largestDeclines || [], gaps = d.missedPreference?.largest?.filter(x => x.gap > 10) || [];
  const cuts = p.teams.flatMap(t => t.out).filter(r => r.kind === 'release' && r.cutKind !== 'recruit');
  const cutPositions = [...new Set(cuts.map(r => r.pos))].sort();
  const roomList = rows => `<div class="ranked-list">${(rows || []).map(r => `<div>${schoolLink(r.teamIndex, r.team)}<span>${number(r.count)} players · ${number(r.excess)} beyond depth</span></div>`).join('')}</div>`;
  return `<details class="league-review" data-view-key="league"><summary>League review · counts, crowded rooms & exceptions</summary><div class="league-review-body"><div class="review-counts">${[['Original user-committed transfers',c.userCommittedTransfers],['Original CPU-committed transfers',c.cpuCommittedTransfers],['Originally uncommitted transfers',c.uncommittedTransfers],['Full CPU market pool',c.pool],['Eligible market candidates',c.eligible],['Excluded candidates',c.excluded],['Original HS/JUCO commitments',c.preservedRecruits],['Retained HS/JUCO commitments',c.preservedRecruits - s.recruitReleases],['Surplus freshmen released',s.surplusReleases],['Other recruit releases',s.recruitReleases - s.surplusReleases],['Protected user commitments',c.userCommitments],['Offer rounds',s.rounds],['Offers made',s.offers],['Schools issuing simultaneous offers',s.schoolsOfferingMultiple],['Final placed / unplaced',`${number(s.placed)} / ${number(s.unplaced)}`]].map(([label,value]) => `<div><span>${html(label)}</span><strong>${html(valueText(value))}</strong></div>`).join('')}</div><div class="league-columns"><section><h3>Largest first-season value declines</h3>${changes.length ? `<div class="ranked-list">${changes.map(r => `<div>${schoolLink(r.teamIndex,r.team)}<span class="negative">${signed(r.change)} V1</span></div>`).join('')}</div>` : '<p class="index-note">No school declined from its native projection.</p>'}<p class="index-note">Open a school to inspect withdrawals, arrivals, releases and each room. A decline is a review signal, not an automatic failure.</p><h3 class="detail-heading">Familiar schools</h3><div class="ranked-list">${(d.familiarSchools || []).map(r => `<div>${r.issue ? `<span>${html(r.name)} · ${html(r.issue)}</span>` : schoolLink(r.teamIndex,r.name)}</div>`).join('')}</div></section><section><h3>Largest final HB rooms</h3>${roomList(d.largestHBRooms)}</section><section><h3>Largest final WR rooms</h3>${roomList(d.largestWRRooms)}</section></div><details class="detail-disclosure" data-view-key="league-cuts"><summary>Veteran releases by position · ${cuts.length} total</summary><table><thead><tr><th>Position</th><th>Inherited overage</th><th>Accepted replacements</th></tr></thead><tbody>${cutPositions.map(pos => `<tr><td>${html(pos)}</td><td class="number-cell">${cuts.filter(r => r.pos === pos && r.cutKind === 'baseline').length}</td><td class="number-cell">${cuts.filter(r => r.pos === pos && r.cutKind === 'replacement').length}</td></tr>`).join('')}</tbody></table></details><details class="detail-disclosure" data-view-key="league-elite"><summary>Elite final-year signers below 35 final opportunity · ${d.lowOpportunityElite?.length || 0}</summary><p class="index-note">${d.rareLowOpportunityElite?.length || 0} have a decisive exceptional social priority. Each card shows actual offers, named final competitors, and the decision-time counterfactual.</p><div class="case-list">${(d.lowOpportunityElite || []).map(i => playerLink(i, nameForPlayer(i))).join('') || '<p class="muted">No cases in this plan.</p>'}</div></details><details class="detail-disclosure" data-view-key="league-misses"><summary>Real misses: a school over 10 utility points better would have offered later · ${number(d.missedPreference?.count || 0)}</summary><p class="index-note">${percent(d.missedPreference?.share)} of signers (${number(d.missedPreference?.willingBetterSchool || 0)} had a willing better school, most of which filled up with players they ranked higher). Showing up to ten largest gaps; these schools were not actual offers the player rejected.</p><div class="ranked-list">${gaps.map(r => `<div><span>${playerLink(r.index,r.name)}<small>${html(schoolName(r.accepted))} accepted; ${html(schoolName(r.betterStandalone))} ${html(r.withheldReason)}, would have offered in round ${number(r.realMissRound)}</small></span><span>+${number(r.gap)} utility</span></div>`).join('') || '<p class="muted">No cases in this plan.</p>'}</div></details><details class="detail-disclosure" data-view-key="league-promises"><summary>Later upgrades blocked by prior promises · ${number(d.promiseBlockCount ?? d.promiseBlocks?.length ?? 0)} recorded</summary><p class="index-note">${number(d.futureHeavySignings?.length || 0)} signings depended mostly on future value. Up to twenty blocked proposals are shown below; each was rejected to preserve an earlier acceptance.</p><div class="promise-list">${(d.promiseBlocks || []).map(r => `<div><strong>${html(r.team)} · round ${r.round}</strong><p>Could not offer ${playerLink(r.index,r.name)} despite ${number(r.net)} positive net.</p>${(r.blockers || []).map(b => `<p>${playerLink(b.index,b.name)}${b.futureHeavy ? ' (future-heavy signing)' : ''}: ${html(b.reasons.join(', '))}. Immediate opportunity ${number(b.original.O1)} → ${number(b.current.O1)}; future ${number(b.original.F)} → ${number(b.current.F)}; utility ${number(b.current.U)} vs outside ${number(b.original.outside)}.</p>`).join('')}</div>`).join('') || '<p class="muted">No blocked proposals recorded.</p>'}</div></details></div></details>`;
}
function renderChanges(changes) {
  if (!changes) return '';
  changes = { ...changes, reason: changes.seedChanged ? `Seed ${changes.previousSeed} → ${changes.seed}` : 'Constraints updated; seed retained' };
  const groups = [['destinations','Changed destinations'],['cuts','Changed releases'],['placement','Placed / unplaced changes']];
  const total = groups.reduce((n, [key]) => n + (changes[key]?.length || 0), 0);
  return `<details class="changes" data-view-key="changes" ${total ? 'open' : ''}><summary>${total ? `${number(total)} changes since your previous plan` : 'Replanned · No player outcomes changed'}${changes.reason ? ` · ${html(changes.reason)}` : ''}</summary>${total ? `<div class="changes-grid">${groups.map(([key,label]) => `<div><h3>${html(label)} <span class="muted">${number(changes[key]?.length || 0)}</span></h3><div class="change-list">${(changes[key] || []).map(c => `<div class="change-row"><strong>${c.playerIndex != null ? playerLink(c.playerIndex,c.name) : html(c.name)}</strong><span>${html(teamLabel(c.from ?? c.before))} → ${html(teamLabel(c.to ?? c.after))}</span></div>`).join('') || '<div class="change-row muted">No changes</div>'}</div></div>`).join('')}</div>` : ''}</details>`;
}

function keptSection(t) {
  if (!t.kept?.length) return '';
  return `<div class="move-section kept-section"><div class="move-title"><h3>Your constraints<span class="count">${t.kept.length}</span></h3><p>Removing a constraint rebuilds this market</p></div><table><tbody>${t.kept.map(r => `<tr><td><button class="player-link" data-action="player" data-player="${r.playerIndex ?? r.index}">${html(r.name)}<span class="sub">${html(r.lock === 'keep' ? 'Protected from release' : 'Excluded from this school')} · ${html(r.now || '')}</span></button></td><td class="position">${html(r.pos)}</td><td><button class="row-action" data-action="restore" data-player="${r.playerIndex ?? r.index}" data-team="${t.index}">Remove constraint</button></td></tr>`).join('')}</tbody></table></div>`;
}
function roomDetails(t) {
  const snapshots = t.snapshots;
  if (!snapshots) return '';
  const stages = [['native', 'Native commitments'], ['postWithdrawal', 'Post-withdrawal'], ['final', 'Final plan']];
  const rooms = Object.keys(snapshots.final?.rooms || {});
  const gapText = r => r ? `${r.emptyFirstTeam} first · ${r.emptyRotation} rotation · ${r.emptyBackups} backup${r.supportSlots ? ` · ${r.emptySupport} support` : ''}` : '—';
  const leader = r => r?.players?.[0] ? `${r.players[0].name} · ${number(r.players[0].overall)} OVR / ${number(r.players[0].q1)} q1` : 'No occupants';
  const recruits = (t.retainedOpportunity || []).filter(p => p.kind === 'recruit');
  return `<details class="room-details" data-view-key="roster" open><summary>Roster projections & room depth</summary><p class="index-note">All three use the same class and rating forecasts. The native roster is an audit reference, not a guaranteed game rollover. q1 is estimated first-season ability; structural vacancies do not guarantee playing time.</p><table class="projection-table"><thead><tr><th>Projection</th><th>Players</th><th>Board used / slots</th><th>First-season value V1</th><th>Future value V2</th></tr></thead><tbody>${stages.map(([key, label], i) => `<tr><td>${label}</td><td class="number-cell">${number(snapshots[key]?.headcount)}</td><td class="number-cell">${number([t.boardUsedBefore, t.boardUsedAfterWithdrawal, t.boardUsed][i])} / ${number(t.boardCapacity)}</td><td class="number-cell">${number(snapshots[key]?.V1)}</td><td class="number-cell">${number(snapshots[key]?.V2)}</td></tr>`).join('')}</tbody></table><p class="index-note">First-season value change: <strong class="${snapshots.final.V1 < snapshots.native.V1 ? 'negative' : 'positive'}">${signed(snapshots.final.V1 - snapshots.native.V1)}</strong>. Simulated development orientation: ${percent(t.schoolSimulation?.d)}; future value weight: ${number(t.schoolSimulation?.delta)}.</p><div class="room-list">${rooms.map(room => `<details class="room-card" data-view-key="room-${html(room)}"><summary><strong>${html(room)}</strong><span>${stages.map(([key]) => number(snapshots[key]?.rooms?.[room]?.count)).join(' → ')} players</span><span class="muted">${number(snapshots.final.rooms[room].emptyFirstTeam)} final first-team gaps</span></summary><div class="room-snapshots">${stages.map(([key, label]) => {
    const r = snapshots[key]?.rooms?.[room];
    return `<section><h4>${label}</h4><p class="room-leader">${html(leader(r))}</p><p>${number(r?.count)} players · V1 ${number(r?.V1)}</p><p class="gap-line">Vacancies: ${html(gapText(r))}<br>Beyond modeled depth: ${number(r?.excess)}</p><div class="room-occupants">${(r?.players || []).map(p => `<div>${playerLink(p.index, p.name)}<span>${number(p.overall)} OVR / ${number(p.q1)} q1</span><small>${html(p.position)} · ${p.kind === 'recruit' ? 'Preserved recruit' : p.kind === 'transfer' ? 'Transfer' : 'Veteran'}</small></div>`).join('') || '<p class="muted">Empty room</p>'}</div></section>`;
  }).join('')}</div></details>`).join('')}</div>${recruits.length ? `<details class="preserved-recruits" data-view-key="recruits"><summary>Preserved HS/JUCO opportunity · ${recruits.length} commitments</summary><table><thead><tr><th>Player</th><th>POS</th><th>Native</th><th>Post-withdrawal</th><th>Final</th></tr></thead><tbody>${recruits.map(p => `<tr><td>${playerLink(p.index, p.name)}</td><td class="position">${html(p.position)}</td>${stages.map(([key]) => `<td class="number-cell">${number(p[key]?.O1)}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="index-note">First-season opportunity indexes; their commitments remain intact.</p></details>` : ''}</details>`;
}

function forecastSection(card) {
  if (!card.forecast) return '';
  return `<div class="drawer-section"><div class="eyebrow">FORECAST / ABILITY & ELIGIBILITY</div>${factGrid([['Current overall · observed', card.ovr], ['First-season ability q1 · estimate', number(card.forecast.q1)], ['Second-season ability q2 · scenario', number(card.forecast.q2)], ['Seasons remaining · derived', card.forecast.seasonsRemaining]])}<p class="index-note">Growth and remaining eligibility are model estimates. The future scenario does not forecast a new recruiting class.</p></div>`;
}
function decisionSection(card) {
  const d = card.decision;
  if (!d) return '';
  const contributionLabels = { football: 'Football priorities', lifestyle: 'Social / dating fit', culture: 'Program culture fit', taste: 'Individual taste', returnFriction: 'Previous-school friction' };
  const footballLabels = { T: 'Immediate opportunity', F: 'Future opportunity scenario', P: 'School prestige', H: 'Home-state proximity', M: 'Game motivation' };
  const pt = card.simulation?.player, features = d.features;
  const finalChange = d.finalUtility - d.utility;
  return `<div class="drawer-section"><div class="eyebrow">DERIVED / WHY BOTH SIDES AGREED</div><div class="decision-grid">${[['Player utility at signing', d.utility], ['His outside option', d.outside], ['Player utility at final roster', d.finalUtility], ['School net value', d.net], ['Roster gain', d.gain], ['Acquisition cost', d.cost]].map(([label, value]) => `<div class="decision-cell"><label>${label}</label><span>${number(value)}</span></div>`).join('')}</div><p class="index-note">The player accepted because utility exceeded his outside option by ${number(d.utility - d.outside)}. The school gained ${number(d.gain)} value at a cost of ${number(d.cost)}, leaving ${number(d.net)} net. These are model indexes, not probabilities or money.</p><p class="why-line later-change">${Math.abs(finalChange) < .000001 ? 'Later roster changes left his utility unchanged.' : `Later roster changes moved his utility by ${signed(finalChange)}; the final opportunity indexes above show his room now.`}</p><h4 class="detail-heading">Contributions to his signing utility</h4><table><thead><tr><th>Factor</th><th>Utility points</th></tr></thead><tbody>${Object.entries(d.contributions || {}).map(([key,value]) => `<tr><td>${html(contributionLabels[key] || human(key))}</td><td class="number-cell ${value < 0 ? 'negative' : 'positive'}">${signed(value)}</td></tr>`).join('')}<tr class="total-row"><td>Total utility</td><td class="number-cell">${number(d.utility)}</td></tr></tbody></table>${features && pt?.weights ? `<details class="detail-disclosure"><summary>Football priorities and their numerical contributions</summary><table><thead><tr><th>Priority</th><th>Index</th><th>Football weight</th><th>Utility points</th></tr></thead><tbody>${Object.entries(features).map(([key,value]) => `<tr><td>${html(footballLabels[key] || key)}</td><td class="number-cell">${number(value)}</td><td class="number-cell">${percent(pt.weights[key])}</td><td class="number-cell">${number((1 - pt.a - pt.b) * pt.weights[key] * value)}</td></tr>`).join('')}</tbody></table></details>` : ''}<details class="detail-disclosure"><summary>School valuation and acquisition quote</summary>${factGrid([['First-season value gain V1', number(d.gain1)], ['Second-season value gain V2', number(d.gain2)], ['Simulated development orientation d', percent(d.d)], ['Future value weight', number(d.delta)], ['Prior market acceptances n', d.n], ['Reserved offer position k', d.k], ['School priority · net plus taste', number(d.priority)], ['Offer round', d.round]])}<p class="index-note">Total gain = first-season gain + future weight × second-season gain. The acquisition quote retains the acceptance count and reserved offer position from this round.</p>${d.cut ? `<p class="why-line later-change">Contingent release: ${playerLink(d.cut.index, d.cut.name)}. His modeled marginal loss was ${number(d.cutLoss)}, already included in the roster gain.</p>` : '<p class="index-note">This acceptance did not require a veteran release.</p>'}</details></div>`;
}
function competitorSection(card) {
  if (!card.competitors?.length) return '';
  return `<details class="detail-disclosure"><summary>Named competitors on the final roster · ${card.competitors.length}</summary><table><thead><tr><th>Player</th><th>POS</th><th>Current OVR</th><th>q1</th><th>q2</th></tr></thead><tbody>${card.competitors.map(p => `<tr><td>${playerLink(p.index, p.name)}</td><td class="position">${html(p.position)}</td><td class="number-cell">${number(p.overall)}</td><td class="number-cell">${number(p.q1)}</td><td class="number-cell">${number(p.q2)}</td></tr>`).join('')}</tbody></table></details>`;
}
function simulationSection(card) {
  const sim = card.simulation || {}, p = sim.player, pair = sim.pair, school = sim.school, cf = sim.lifestyleCounterfactual;
  if (!p) return '';
  const ordinaryDestination = cf?.ordinaryChoice == null ? 'Unplaced' : schoolName(cf.ordinaryChoice);
  const unknowns = pair ? [!pair.motivationAvailable && 'Game motivation input unavailable: neutral index 50.', !pair.prestigeAvailable && 'School prestige unavailable: neutral index 50.', !pair.geographyAvailable && 'Home-state comparison unavailable: neutral index 50.'].filter(Boolean) : [];
  return `<div class="drawer-section"><div class="eyebrow">SIMULATED / INDIVIDUAL PREFERENCES</div><p class="traits-note">Generated before offers and held fixed by the seed. These are fictional model traits, not claims about real players, campuses, or people.</p>${factGrid([['Football share of utility', percent(1-p.a-p.b)], ['Social / dating weight', percent(p.a)], ['Ordinary social / dating weight', percent(p.aOrd)], ['Program culture weight', percent(p.b)], ['Exceptional social priority drawn', p.rareLifestyle], ['Outside option', number(p.outside)]])}${pair ? `<details class="detail-disclosure"><summary>How this player and school fit</summary>${factGrid([['Player social preference', number(p.socialIdeal)], ['School social scene', number(school?.socialScene)], ['Simulated dating fit', number(pair.datingFit)], ['Combined social / dating fit', number(pair.L)], ['Player culture preference', number(p.cultureIdeal)], ['School development orientation', percent(school?.d)], ['Program culture fit', number(pair.C)], ['Player residual taste', signed(pair.taste)], ['School residual taste', signed(pair.schoolTaste)], ['Previous-school friction', number(pair.returnFriction)]])}</details>` : ''}${unknowns.length ? `<p class="index-note">${unknowns.map(html).join('<br>')}</p>` : ''}${cf?.applicable ? `<div class="counterfactual"><strong>${cf.decisive ? 'The exceptional priority changed this decision.' : 'The exceptional priority did not change this decision.'}</strong><p>With his ordinary ${percent(p.aOrd)} social weight, ${cf.ordinaryRejectsAccepted ? 'he would reject this accepted offer' : 'this accepted offer still clears his outside option'}. ${cf.ordinaryChoiceChanged ? `His choice among the offers actually made would become ${html(ordinaryDestination)}.` : 'He would choose the same school.'}</p>${!cf.decisive ? '<p>The rare trait is not credited as the cause of this destination.</p>' : ''}</div><details class="detail-disclosure"><summary>Actual-offer counterfactual comparison</summary><table><thead><tr><th>School</th><th>Opportunity</th><th>Actual utility</th><th>Ordinary utility</th></tr></thead><tbody>${(cf.alternatives || []).map(a => `<tr><td>${schoolLink(a.teamIndex)}</td><td class="number-cell">${number(a.O1)}</td><td class="number-cell">${number(a.U)}</td><td class="number-cell">${number(a.ordinaryU)}${a.ordinaryU <= a.outside ? ' · rejects' : ''}</td></tr>`).join('')}</tbody></table><p class="index-note">This changes only his social weight across the actual offers at decision time; it does not rerun the market or attribute later low opportunity to that weight.</p></details>` : ''}</div>`;
}
function alternativesSection(card) {
  const offers = card.alternatives || [], best = card.decision?.bestStandalone, gap = card.decision?.missedPreferenceGap;
  if (!offers.length && !best) return '';
  return `<div class="drawer-section"><div class="eyebrow">ACTUAL OFFERS AT HIS DECISION</div><table><thead><tr><th>School</th><th>Utility</th><th>Opportunity</th><th>Decision</th></tr></thead><tbody>${offers.map(a => `<tr><td>${schoolLink(a.teamIndex,teamLabel(a.team))}</td><td class="number-cell">${number(a.utility)}</td><td class="number-cell">${number(a.opportunity)}</td><td>${a.accepted ? '<span class="positive">Accepted</span>' : '<span class="muted">Declined</span>'}</td></tr>`).join('')}</tbody></table>${best?.withheldReason ? `<div class="counterfactual"><strong>A willing standalone alternative did not offer</strong><p>${html(best.team)}: utility ${number(best.utility)} and opportunity ${number(best.opportunity)}. ${gap > 0 ? `That is ${number(gap)} utility points above his accepted offer. ` : ''}The school ${html(best.withheldReason)}. This was not an offer he rejected.</p></div>` : ''}</div>`;
}
function releaseSection(card) {
  const r = card.release;
  if (!r) return '';
  return `<div class="drawer-section"><div class="eyebrow">DERIVED / ${r.kind === 'recruit' ? 'RECRUIT' : 'VETERAN'} RELEASE</div>${factGrid([['Release type', r.reason === 'surplus' ? 'Surplus freshman cleanup' : r.kind === 'baseline' ? 'Overage release' : r.kind === 'recruit' ? 'Recruit un-signed for board room' : 'Contingent replacement'], ['Marginal modeled loss', number(r.marginalLoss)], ['First-season loss V1', number(r.loss1)], ['Second-season loss V2', number(r.loss2)], ['Room count before release', r.roomCountBefore], ['Minimum protected room coverage', r.coverageFloor]])}<p class="index-note">${r.reason === 'surplus' ? `Beyond modeled depth with zero current and future value loss. ${number(r.futureCountAfter)} future-eligible players remain; minimum ${number(r.futureFloor)}. ${r.round === 0 ? 'Cleared before transfer offers and veteran overage cuts.' : `Became surplus after arrivals in round ${number(r.round)}.`}` : r.kind === 'baseline' ? 'This release brings an inherited overage toward 85 while preserving retained commitments and coverage.' : `This release happens only because ${html(r.forName)} accepted the replacement offer.`} The player remains teamless; the game controls his subsequent fate.</p></div>`;
}
function vetoSection(card) {
  if (!card.vetoes) return '';
  return `<div class="drawer-section"><div class="eyebrow">WHY NO DESTINATION REMAINED</div><table><thead><tr><th>Reason</th><th>Schools</th></tr></thead><tbody>${Object.entries(card.vetoes).sort((a,b) => b[1]-a[1]).map(([reason, count]) => `<tr><td>${html(human(reason))}</td><td class="number-cell">${number(count)}</td></tr>`).join('')}</tbody></table><p class="index-note">These constraints can overlap; the counts are not separate shares of schools.</p>${card.boardOnlyVetoes?.length ? `<p class="why-line later-change">Board capacity alone prevented an otherwise acceptable offer at ${card.boardOnlyVetoes.map(v => html(schoolName(typeof v === 'number' ? v : v.teamIndex))).join(', ')}.</p>` : ''}</div>`;
}
function renderPlayer(card) { setContent($('#player-content'), views.player(card)); }

async function loadPlayer(index) {
  if (ui.busy) return;
  error('');
  ui.playerAbort?.abort();
  const request = ++ui.playerRequest, controller = new AbortController();
  ui.playerAbort = controller; ui.card = null; ui.playerTab = 'profile';
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  setContent($('#player-content'), '<div class="drawer-top"><span class="eyebrow">PLAYER REVIEW</span><button class="close-button" data-action="close-player" aria-label="Close player">×</button></div><div class="drawer-loading">Loading player review…</div>');
  try {
    const card = await api(`/api/player?index=${encodeURIComponent(index)}`, undefined, { signal: controller.signal });
    if (request !== ui.playerRequest || !dialog.open) return;
    ui.card = card; renderPlayer(card);
  } catch (e) {
    if (request !== ui.playerRequest || !dialog.open || e.name === 'AbortError') return;
    setContent($('#player-content'), `<div class="drawer-top"><span class="eyebrow">PLAYER REVIEW</span><button class="close-button" data-action="close-player" aria-label="Close player">×</button></div><div class="drawer-loading" role="alert">${html(e.message)}</div>`);
  }
}

async function refreshSaves() { ui.saves = await api('/api/saves'); renderWelcome(); window.scrollTo(0, 0); }
async function openSave(path) {
  const opened = await api('/api/open', { path });
  resetReview(); ui.opened = opened; renderTeamPicker(); window.scrollTo(0, 0);
}
async function openWorkspace(teamIndex) {
  ui.dynasty = await api('/api/user-team', { teamIndex, tool: 'browse' });
  renderDashboard(); rememberRoute('dashboard'); window.scrollTo(0, 0);
}
async function startup() {
  await refreshSaves();
  const { lastSavePath } = await api('/api/startup');
  if (!lastSavePath) return;
  try {
    await openSave(lastSavePath);
    // Reuse only a valid school explicitly selected for this same save on an earlier visit.
    const remembered = ui.opened.teams.find(t => t.index === ui.opened.suggestedUserTeam);
    if (remembered) await openWorkspace(remembered.index);
  } catch (e) {
    error('Could not reopen the last dynasty: ' + e.message);
  }
}

async function mutate(endpoint, body, message = 'Rebuilding the market…') { await work(message, async () => { await acceptPlan(await api(endpoint, body)); }); }

document.addEventListener('submit', event => {
  const form = event.target;
  if (!['open-form', 'team-form', 'seed-form'].includes(form.id)) return;
  event.preventDefault();
  if (form.id === 'open-form') { const savePath = new FormData(form).get('path'); work('Opening dynasty…', () => openSave(savePath)); }
  if (form.id === 'team-form') {
    const picked = new FormData(form).get('teamIndex');
    if (picked === '' || picked === null) return error('Select your school first.');
    work('Opening dynasty workspace…', () => openWorkspace(Number(picked)));
  }
  if (form.id === 'seed-form') {
    const seed = String(new FormData(form).get('seed') || '').trim();
    if (!seed) return error('Enter a seed to rebuild.');
    mutate('/api/replan', { seed });
  }
});
document.addEventListener('change', event => {
  if (event.target.id === 'school-sort') { ui.schoolSort = event.target.value; setContent($('#dynasty-schools'), views.schoolResults()); }
  if (event.target.id !== 'user-team') return;
  const value = event.target.value; $('#build-button').disabled = value === '';
  const team = ui.opened.teams.find(t => t.index === Number(value));
  $('#selection-preview').innerHTML = value !== '' && team ? '<div class="selection-preview">' + logo(team) + '<strong>' + html(team.name) + '</strong></div>' : '';
});
document.addEventListener('input', event => {
  const input = event.target;
  if (input.id === 'dynasty-school-search') { ui.schoolSearch = input.value; setContent($('#dynasty-schools'), views.schoolResults()); }
  if (input.id === 'roster-search') { ui.rosterSearch = input.value; setContent($('#roster-players'), views.rosterResults()); }
  if (input.id === 'ratings-search') { ui.ratingsSearch = input.value; setContent($('#ratings-cards'), views.ratingCards()); }
  if (input.id === 'market-search') {
    ui.marketSearch = input.value; ui.marketPage = 0; const pos = input.selectionStart;
    setContent($('#market-results'), views.marketResults()); $('#market-search').focus(); $('#market-search').setSelectionRange(pos, pos);
  }
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  if (button.tagName === 'A') event.preventDefault();
  const action = button.dataset.action;
  if (action === 'close-player') return closePlayer();
  if (ui.busy) return;
  if (action.startsWith('nav-') && ui.dynasty) return navigate(action.slice(4));
  if (action === 'home') {
    resetReview(); ui.opened = null; renderWelcome(); window.scrollTo(0, 0); work('Loading saves…', refreshSaves);
  }
  if (action === 'refresh-saves') work('Loading saves…', refreshSaves);
  if (action === 'open-listed') work('Opening dynasty…', () => openSave(ui.saves[Number(button.dataset.save)].path));
  if (action === 'select-team') work('Loading school…', () => openTeam(Number(button.dataset.team)));
  if (action === 'team-tab') { ui.teamTab = button.dataset.tab; renderTeamPage(); }
  if (action === 'roster-basis') { ui.rosterBasis = button.dataset.basis; setContent($('#team-body'), views.teamBody()); }
  if (action === 'market-tab') { ui.marketTab = button.dataset.tab; ui.marketSearch = ''; ui.marketPage = 0; renderPlan(); }
  if (action === 'market-page') { ui.marketPage = Number(button.dataset.page); setContent($('#market-results'), views.marketResults()); $('#market-results').scrollIntoView({block:'start'}); }
  if (action === 'player-tab') { ui.playerTab = button.dataset.tab; renderPlayer(ui.card); dialog.scrollTop = 0; }
  if (action === 'player') loadPlayer(Number(button.dataset.player));
  if (action === 'run-transfers') work('Building the CPU transfer market…', () => runTool('transfers'));
  if (action === 'run-ratings') work('Calculating team ratings…', () => runTool('team-ratings'));
  if (action === 'rating-team') { ui.ratingsTeam = Number(button.dataset.team); renderRatings(); $('#ratings-detail').scrollIntoView({block:'start'}); }
  if (action === 'undo') mutate('/api/undo', { playerIndex: Number(button.dataset.player), teamIndex: Number(button.dataset.team), kind: button.dataset.kind });
  if (action === 'restore') mutate('/api/restore', { playerIndex: Number(button.dataset.player), teamIndex: Number(button.dataset.team) });
  if (action === 'review') mutate('/api/review', { teamIndex: Number(button.dataset.team), reviewed: button.dataset.reviewed === 'true' }, 'Updating review…');
  if (action === 'save' || action === 'save-ratings') work('Saving, then reopening for verification…', async () => {
    const ratings = action === 'save-ratings', preview = ratings ? ui.ratings : ui.plan;
    const result = await api('/api/save', { planId: preview.id, tool: ratings ? 'team-ratings' : 'transfers' });
    resetReview(); ui.opened = null; renderWelcome({ ...result, fileName: preview.save.fileName }); window.scrollTo(0, 0);
  });
  if (action === 'export') {
    const blob = new Blob([JSON.stringify(ui.plan, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'signing-day-' + String(ui.plan.seed).replace(/[^a-z0-9-]/gi, '-') + '.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Review exported.');
  }
});


dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePlayer(); } });
dialog.addEventListener('close', () => { if (!dialog.open) { ui.playerRequest++; ui.playerAbort?.abort(); ui.card = null; } });
renderWelcome();
work('Opening dynasty workspace…', startup);
