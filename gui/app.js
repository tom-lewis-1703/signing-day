const $ = selector => document.querySelector(selector);
const app = $('#app');
const dialog = $('#player-dialog');
const ui = { saves: [], opened: null, plan: null, selected: null, filter: 'all', search: '', poolSearch: '', poolPage: 0, busy: false, card: null };
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
const schoolName = index => ui.plan?.teams.find(t => t.index === index)?.name ?? (ui.plan?.userTeam?.index === index ? ui.plan.userTeam.name : 'Unplaced');
const factGrid = rows => `<div class="facts-grid">${rows.map(([label, value]) => `<div class="fact"><label>${html(label)}</label><span>${html(valueText(value))}</span></div>`).join('')}</div>`;
const playerLink = (index, name) => `<button class="player-link" data-action="player" data-player="${index}">${html(name)}</button>`;
const schoolLink = (index, name) => `<button class="player-link" data-action="select-team" data-team="${index}">${html(name || schoolName(index))}</button>`;
function nameForPlayer(index) {
  const moved = ui.plan?.teams.flatMap(t => [...t.in, ...t.out, ...t.kept]).find(p => p.playerIndex === index) || ui.plan?.unplaced.find(p => p.playerIndex === index);
  return moved?.name ?? `Player ${index}`;
}

async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || data.failed?.join('\n') || 'The action could not be completed.');
  return data;
}

function error(message) { const el = $('#error'); el.textContent = message || ''; el.hidden = !message; }
function toast(message) { const el = $('#toast'); el.textContent = message; el.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, 4200); }
function setBusy(busy, message = 'Working…') {
  ui.busy = busy; $('#activity').hidden = !busy; $('#activity-text').textContent = message;
  document.querySelectorAll('button, input, select').forEach(el => {
    if (busy) { el.dataset.wasDisabled = el.disabled ? 'yes' : 'no'; el.disabled = true; }
    else if ('wasDisabled' in el.dataset) { el.disabled = el.dataset.wasDisabled === 'yes'; delete el.dataset.wasDisabled; }
  });
}
async function work(message, fn) {
  if (ui.busy) return;
  error(''); setBusy(true, message);
  try { await fn(); } catch (e) { error(e.message); } finally { setBusy(false); }
}

function renderWelcome(saved = null) {
  if (saved) {
    app.innerHTML = `<section class="saved"><div class="saved-badge">✓</div><div class="eyebrow">SAVE COMPLETE</div><h1>Your offseason is ready.</h1><p>The reviewed plan was written and reopened successfully. Your backup is ready below.</p><div class="backup-box"><div class="eyebrow">VERIFIED BACKUP</div><div class="backup-path">${html(saved.backupPath)}</div></div><p class="file-label">${html(saved.fileName || '')}</p><button class="primary" data-action="home">Open another save</button></section>`;
    return;
  }
  app.innerHTML = `<section class="welcome"><div class="welcome-intro"><div><div class="eyebrow">ONE OFFSEASON. THE WHOLE LEAGUE.</div><h1>Let the market<br>find its match.</h1></div><p>Review the CPU transfer market after you finish recruiting. <strong>Your roster and commitments stay protected.</strong> Every change is yours to review before saving.</p></div><div class="welcome-panel"><div class="section-top"><div><h3>Open a Signing Day save</h3><p>Your local dynasty saves, most recent first</p></div><button class="small quiet" data-action="refresh-saves">Refresh</button></div><div class="file-list">${ui.saves.length ? ui.saves.map((s, i) => `<button class="save-file" data-action="open-listed" data-save="${i}"><span class="file-icon">↗</span><span><span class="file-name">${html(s.name)}</span><span class="file-date">${html(dateText(s.modified))}</span></span><span class="file-arrow">→</span></button>`).join('') : '<div class="empty">No dynasty saves found in the game’s saves folder.<br>Paste a save path below.</div>'}</div><form class="path-form" id="open-form"><label class="field-label" for="save-path">Or paste the full path to a save</label><div class="input-row"><input id="save-path" name="path" required placeholder="C:\\…\\DYNASTY-SIGNINGDAY" autocomplete="off" spellcheck="false"><button class="primary" type="submit">Open save →</button></div></form></div><p class="welcome-foot">Opening and planning do not change your save. Save creates a backup and verifies the written file.</p></section>`;
}

function renderTeamPicker() {
  const o = ui.opened;
  const suggestion = o.teams.find(t => t.index === o.suggestedUserTeam);
  const correctStage = o.stage?.id === 'signing-day';
  app.innerHTML = `<section class="team-picker"><div class="eyebrow">YOUR TEAM COMES FIRST</div><h1>Choose the school<br>you’re protecting.</h1><p class="muted">Your team sits outside the CPU market. Its roster and every existing commitment are preserved.</p><form class="selection-box" id="team-form"><div class="file-label">${html(o.fileName)} · ${html(o.stage?.label)}</div>${!correctStage ? `<div class="notice" style="margin-top:20px">This save is ${html(o.stage?.label)}. Open a Signing Day save to build a market.</div>` : ''}<label class="field-label" for="user-team">Your school</label><select id="user-team" name="teamIndex" required ${correctStage ? '' : 'disabled'}><option value="" selected>Select your team…</option>${o.teams.map(t => `<option value="${t.index}">${html(t.name)}</option>`).join('')}</select>${suggestion ? `<p class="suggestion">Previously selected: <strong>${html(suggestion.name)}</strong>. Select your school above to continue.</p>` : ''}<div id="selection-preview"></div><label class="field-label" for="initial-seed">Market seed <span class="muted">· optional</span></label><input id="initial-seed" name="seed" placeholder="Use the default season seed" spellcheck="false" autocomplete="off"><p class="suggestion">The same seed and constraints reproduce the same market.</p><div class="picker-actions"><button type="button" class="quiet" data-action="home">← Choose a different save</button><button class="primary" id="build-button" type="submit" disabled>Build market →</button></div></form></section>`;
}

function acceptPlan(plan) {
  ui.plan = plan;
  if (ui.selected !== 'pool' && !plan.teams.some(t => t.index === ui.selected)) ui.selected = plan.teams.find(t => t.status === 'CHANGED')?.index ?? plan.teams[0]?.index ?? 'pool';
  ui.card = null;
  if (dialog.open) dialog.close();
  renderPlan();
}

function renderPlan() {
  const p = ui.plan, s = p.summary || {};
  const changed = p.teams.filter(t => t.status), reviewed = changed.filter(t => t.status === 'REVIEWED').length;
  app.innerHTML = `<section class="workspace"><div class="workspace-top"><div class="save-heading"><div class="eyebrow">SIGNING DAY / CPU TRANSFER MARKET</div><h2>Your offseason, under review.</h2><div class="file-label">${html(p.save.fileName)}</div></div><div class="workspace-actions"><button class="quiet small" data-action="home">Open another save</button><button class="primary" data-action="save">Save reviewed plan →</button><div class="user-tag">${logo(p.userTeam)}<div><small>PROTECTED</small><strong>${html(p.userTeam?.name)}</strong></div></div></div><div class="summary-strip">${stat(s.placed, 'Transfers placed', 'New market commitments')}${stat(s.unplaced ?? s.dropped, 'Remain unplaced', 'No forced destinations')}${stat(s.withdrawn, 'CPU commitments reopened', 'Original destinations released')}${stat(s.cuts, 'Veterans released', `${number(s.baselineCuts)} overage · ${number(s.replacementCuts)} replacements`)}${stat(s.excludedTeams ?? 0, 'Schools excluded', 'Roster protections preserved')}${stat(p.locks?.count ?? 0, 'Your constraints', 'Kept players & excluded pairs')}</div><div class="seed-bar"><form class="seed-form" id="seed-form"><label for="seed">SEED</label><input id="seed" name="seed" value="${html(p.seed)}" required spellcheck="false" autocomplete="off"><button type="submit">Replan</button></form><div class="review-progress"><span>${reviewed} / ${changed.length} changed schools reviewed</span><div class="review-meter"><span style="width:${changed.length ? Math.round(reviewed / changed.length * 100) : 0}%"></span></div></div></div>${renderWarnings(p.warnings)}${renderChanges(p.changes)}${leagueReview(p)}<div class="desk"><aside class="school-rail"><div class="rail-top"><div class="rail-heading"><span class="eyebrow">SCHOOLS</span><span>${p.teams.length} CPU</span></div><input id="school-search" placeholder="Find a school…" value="${html(ui.search)}" autocomplete="off"><div class="rail-filter">${[['all','All'],['changed','Changed'],['attention','Re-check']].map(([key, label]) => `<button class="${ui.filter === key ? 'active' : ''}" data-action="filter" data-filter="${key}">${label}</button>`).join('')}</div></div><div id="school-list" class="school-list">${schoolList()}</div><button class="pool-button ${ui.selected === 'pool' ? 'active' : ''}" data-action="select-pool"><span>Unplaced transfers</span><span class="num">${number(p.unplaced?.length ?? s.unplaced)}</span></button></aside><section id="team-sheet" class="team-sheet">${selectedSheet()}</section></div><div class="footer-note"><span>Planning only · Your save changes only when you select Save. Preserved recruits stay committed.</span><button data-action="export">Export this review as JSON ↗</button></div></section>`;
}

function stat(value, label, note) { return `<div class="stat"><div class="stat-value">${number(value ?? 0)}</div><div class="stat-label">${html(label)}</div><div class="stat-note">${html(note)}</div></div>`; }
function renderWarnings(warnings = []) {
  if (!warnings.length) return '';
  return `<details class="notice"><summary>${warnings.length} ${warnings.length === 1 ? 'exception' : 'exceptions'} & model notes to review</summary><ul>${warnings.map(w => `<li>${html(typeof w === 'string' ? w : w.message || valueText(w))}</li>`).join('')}</ul></details>`;
}
function leagueReview(p) {
  const c = p.inputCounts || {}, d = p.diagnostics || {}, s = p.summary || {};
  const changes = d.largestDeclines || [], gaps = d.missedPreference?.largest?.filter(x => x.gap > 10) || [];
  const cuts = p.teams.flatMap(t => t.out).filter(r => r.kind !== 'withdrawal');
  const cutPositions = [...new Set(cuts.map(r => r.pos))].sort();
  const roomList = rows => `<div class="ranked-list">${(rows || []).map(r => `<div>${schoolLink(r.teamIndex, r.team)}<span>${number(r.count)} players · ${number(r.excess)} beyond depth</span></div>`).join('')}</div>`;
  return `<details class="league-review"><summary>League review · counts, crowded rooms & exceptions</summary><div class="league-review-body"><div class="review-counts">${[['Original user-committed transfers',c.userCommittedTransfers],['Original CPU-committed transfers',c.cpuCommittedTransfers],['Originally uncommitted transfers',c.uncommittedTransfers],['Full CPU market pool',c.pool],['Eligible market candidates',c.eligible],['Excluded candidates',c.excluded],['Preserved HS/JUCO',c.preservedRecruits],['Protected user commitments',c.userCommitments],['Offer rounds',s.rounds],['Offers made',s.offers],['Schools issuing simultaneous offers',s.schoolsOfferingMultiple],['Final placed / unplaced',`${number(s.placed)} / ${number(s.unplaced)}`]].map(([label,value]) => `<div><span>${html(label)}</span><strong>${html(valueText(value))}</strong></div>`).join('')}</div><div class="league-columns"><section><h3>Largest first-season value declines</h3>${changes.length ? `<div class="ranked-list">${changes.map(r => `<div>${schoolLink(r.teamIndex,r.team)}<span class="negative">${signed(r.change)} V1</span></div>`).join('')}</div>` : '<p class="index-note">No school declined from its native projection.</p>'}<p class="index-note">Open a school to inspect withdrawals, arrivals, releases and each room. A decline is a review signal, not an automatic failure.</p><h3 class="detail-heading">Familiar schools</h3><div class="ranked-list">${(d.familiarSchools || []).map(r => `<div>${r.issue ? `<span>${html(r.name)} · ${html(r.issue)}</span>` : schoolLink(r.teamIndex,r.name)}</div>`).join('')}</div></section><section><h3>Largest final HB rooms</h3>${roomList(d.largestHBRooms)}</section><section><h3>Largest final WR rooms</h3>${roomList(d.largestWRRooms)}</section></div><details class="detail-disclosure"><summary>Veteran releases by position · ${cuts.length} total</summary><table><thead><tr><th>Position</th><th>Inherited overage</th><th>Accepted replacements</th></tr></thead><tbody>${cutPositions.map(pos => `<tr><td>${html(pos)}</td><td class="number-cell">${cuts.filter(r => r.pos === pos && r.cutKind === 'baseline').length}</td><td class="number-cell">${cuts.filter(r => r.pos === pos && r.cutKind === 'replacement').length}</td></tr>`).join('')}</tbody></table></details><details class="detail-disclosure"><summary>Elite final-year signers below 35 final opportunity · ${d.lowOpportunityElite?.length || 0}</summary><p class="index-note">${d.rareLowOpportunityElite?.length || 0} have a decisive exceptional social priority. Each card shows actual offers, named final competitors, and the decision-time counterfactual.</p><div class="case-list">${(d.lowOpportunityElite || []).map(i => playerLink(i, nameForPlayer(i))).join('') || '<p class="muted">No cases in this plan.</p>'}</div></details><details class="detail-disclosure"><summary>Real misses: a school over 10 utility points better would have offered later · ${number(d.missedPreference?.count || 0)}</summary><p class="index-note">${percent(d.missedPreference?.share)} of signers (${number(d.missedPreference?.willingBetterSchool || 0)} had a willing better school, most of which filled up with players they ranked higher). Showing up to ten largest gaps; these schools were not actual offers the player rejected.</p><div class="ranked-list">${gaps.map(r => `<div><span>${playerLink(r.index,r.name)}<small>${html(schoolName(r.accepted))} accepted; ${html(schoolName(r.betterStandalone))} ${html(r.withheldReason)}, would have offered in round ${number(r.realMissRound)}</small></span><span>+${number(r.gap)} utility</span></div>`).join('') || '<p class="muted">No cases in this plan.</p>'}</div></details><details class="detail-disclosure"><summary>Later upgrades blocked by prior promises · ${number(d.promiseBlockCount ?? d.promiseBlocks?.length ?? 0)} recorded</summary><p class="index-note">${number(d.futureHeavySignings?.length || 0)} signings depended mostly on future value. Up to twenty blocked proposals are shown below; each was rejected to preserve an earlier acceptance.</p><div class="promise-list">${(d.promiseBlocks || []).map(r => `<div><strong>${html(r.team)} · round ${r.round}</strong><p>Could not offer ${playerLink(r.index,r.name)} despite ${number(r.net)} positive net.</p>${(r.blockers || []).map(b => `<p>${playerLink(b.index,b.name)}${b.futureHeavy ? ' (future-heavy signing)' : ''}: ${html(b.reasons.join(', '))}. Immediate opportunity ${number(b.original.O1)} → ${number(b.current.O1)}; future ${number(b.original.F)} → ${number(b.current.F)}; utility ${number(b.current.U)} vs outside ${number(b.original.outside)}.</p>`).join('')}</div>`).join('') || '<p class="muted">No blocked proposals recorded.</p>'}</div></details></div></details>`;
}
function renderChanges(changes) {
  if (!changes) return '';
  changes = { ...changes, reason: changes.seedChanged ? `Seed ${changes.previousSeed} → ${changes.seed}` : 'Constraints updated; seed retained' };
  const groups = [['destinations','Changed destinations'],['cuts','Changed veteran releases'],['placement','Placed / unplaced changes']];
  const total = groups.reduce((n, [key]) => n + (changes[key]?.length || 0), 0);
  return `<details class="changes" ${total ? 'open' : ''}><summary>${total ? `${number(total)} changes since your previous plan` : 'Replanned · No player outcomes changed'}${changes.reason ? ` · ${html(changes.reason)}` : ''}</summary>${total ? `<div class="changes-grid">${groups.map(([key,label]) => `<div><h3>${html(label)} <span class="muted">${number(changes[key]?.length || 0)}</span></h3><div class="change-list">${(changes[key] || []).map(c => `<div class="change-row"><strong>${html(c.name)}</strong><span>${html(teamLabel(c.from ?? c.before))} → ${html(teamLabel(c.to ?? c.after))}</span></div>`).join('') || '<div class="change-row muted">No changes</div>'}</div></div>`).join('')}</div>` : ''}</details>`;
}

function schoolList() {
  const teams = ui.plan.teams.filter(t => t.name.toLowerCase().includes(ui.search.toLowerCase()) && (ui.filter === 'all' || ui.filter === 'changed' && t.status || ui.filter === 'attention' && (t.status === 'RE-CHECK' || t.excluded)));
  return teams.length ? teams.map(t => `<button class="school-button ${t.index === ui.selected ? 'active' : ''}" data-action="select-team" data-team="${t.index}">${logo(t)}<span class="school-name">${html(t.name)}<small>${number(t.rosterAfter)} PLAYERS${t.excluded ? ' · EXCLUDED' : ''}</small></span><span class="school-counts">+${t.in?.length || 0}<span class="outs">−${t.out?.length || 0}</span></span><span class="review-dot ${html(t.status)}" title="${html(t.status)}"></span></button>`).join('') : '<div class="empty">No matching schools.</div>';
}
function selectedSheet() {
  if (ui.selected === 'pool') return poolSheet();
  const t = ui.plan.teams.find(x => x.index === ui.selected);
  if (!t) return '<div class="no-selection"><h2>Select a school</h2><p>Review its arrivals, releases, and final roster.</p></div>';
  const status = t.excluded ? 'excluded' : t.status;
  return `<div class="team-sheet-head">${logo(t)}<div class="team-sheet-title"><div class="eyebrow">CPU ROSTER REVIEW</div><h2>${html(t.name)}</h2><p>${t.excluded ? 'Excluded from offers · protections could not accommodate the inherited roster' : 'Native commitments → post-withdrawal → final planned roster'}</p></div><div><span class="pill ${html(status)}">${html(status || 'No moves')}</span>${!t.excluded ? `<div style="margin-top:10px"><button class="small quiet" data-action="review" data-team="${t.index}" data-reviewed="${t.status === 'REVIEWED' ? 'false' : 'true'}">${t.status === 'REVIEWED' ? 'Mark unreviewed' : 'Mark reviewed ✓'}</button></div>` : ''}</div></div><div class="team-metrics"><div class="team-metric"><label>Projected players</label><span>${number(t.rosterBefore)}<i class="arrow">→</i>${finite(t.rosterAfterWithdrawal) ? `${number(t.rosterAfterWithdrawal)}<i class="arrow">→</i>` : ''}${number(t.rosterAfter)}</span></div><div class="team-metric"><label>Final commitment board</label><span>${number(t.boardUsed)}<i class="arrow">/</i>${number(t.boardCapacity)}</span></div><div class="team-metric"><label>Market arrivals / releases</label><span class="positive">+${number(t.in?.length || 0)}</span><span class="negative"> / −${number((t.out || []).filter(r => r.kind !== 'withdrawal').length)}</span></div></div>${t.excluded ? `<p class="team-note negative">${html(t.excludedReason || 'Existing commitments and protected players prevent this school from reaching 85. CPU transfer commitments still enter the market.')}</p>` : ''}${moveSection(t, 'in', 'Incoming transfers', 'Both sides accepted this opportunity')}${moveSection(t, 'out', 'Departures & releases', 'Reopened commitments are separate from veteran cuts')}${keptSection(t)}${roomDetails(t)}</div>`;
}

function moveSection(team, direction, title, subtitle) {
  const rows = team[direction] || [];
  return `<div class="move-section"><div class="move-title"><h3>${title}<span class="count">${rows.length}</span></h3><p>${subtitle}</p></div>${rows.length ? `<table><thead><tr><th>Player</th><th>POS</th><th>OVR</th>${direction === 'in' ? '<th>Opportunity</th><th>School net</th>' : '<th>Outcome</th>'}<th></th></tr></thead><tbody>${rows.map(row => moveRow(row, team, direction)).join('')}</tbody></table>` : `<div class="empty-row">${direction === 'in' ? 'No transfers signed in this market.' : 'No departures or veteran releases in this plan.'}</div>`}</div>`;
}
function moveRow(row, team, direction) {
  const isWithdrawal = row.kind === 'withdrawal' || row.kind === 'Withdrawn' || row.kind === 'CPU withdrawal';
  const playerIndex = row.playerIndex ?? row.index;
  const opp = typeof row.opportunity === 'object' ? row.opportunity?.final ?? row.opportunity?.O1 : row.opportunity;
  const sub = direction === 'in' ? (row.from ? `From ${teamLabel(row.from)}` : row.role || '') : row.reason || '';
  return `<tr><td><button class="player-link" data-action="player" data-player="${playerIndex}">${html(row.name)}${sub ? `<span class="sub">${html(sub)}</span>` : ''}</button></td><td class="position">${html(row.pos ?? row.position)}</td><td class="number-cell">${number(row.ovr ?? row.overall)}</td>${direction === 'in' ? `<td class="number-cell">${number(opp)}</td><td class="number-cell positive">${number(row.net ?? row.schoolNet)}</td>` : `<td><span class="out-kind">${html(isWithdrawal ? 'Commitment reopened' : row.cutKind === 'baseline' ? 'Overage release' : row.cutKind === 'replacement' ? 'Replacement release' : row.kind || 'Released')}</span>${row.to ? `<div class="out-reason">→ ${html(teamLabel(row.to))}</div>` : ''}</td>`}<td>${direction === 'in' ? `<button class="row-action" data-action="undo" data-kind="in" data-player="${playerIndex}" data-team="${team.index}">Exclude pairing</button>` : isWithdrawal ? '<span class="muted" style="font-size:10px">In market</span>' : `<button class="row-action" data-action="undo" data-kind="out" data-player="${playerIndex}" data-team="${team.index}">Keep player</button>`}</td></tr>`;
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
  return `<details class="room-details" open><summary>Roster projections & room depth</summary><p class="index-note">All three use the same class and rating forecasts. The native roster is an audit reference, not a guaranteed game rollover. q1 is estimated first-season ability; structural vacancies do not guarantee playing time.</p><table class="projection-table"><thead><tr><th>Projection</th><th>Players</th><th>Board used / slots</th><th>First-season value V1</th><th>Future value V2</th></tr></thead><tbody>${stages.map(([key, label], i) => `<tr><td>${label}</td><td class="number-cell">${number(snapshots[key]?.headcount)}</td><td class="number-cell">${number([t.boardUsedBefore, t.boardUsedAfterWithdrawal, t.boardUsed][i])} / ${number(t.boardCapacity)}</td><td class="number-cell">${number(snapshots[key]?.V1)}</td><td class="number-cell">${number(snapshots[key]?.V2)}</td></tr>`).join('')}</tbody></table><p class="index-note">First-season value change: <strong class="${snapshots.final.V1 < snapshots.native.V1 ? 'negative' : 'positive'}">${signed(snapshots.final.V1 - snapshots.native.V1)}</strong>. Simulated development orientation: ${percent(t.schoolSimulation?.d)}; future value weight: ${number(t.schoolSimulation?.delta)}.</p><div class="room-list">${rooms.map(room => `<details class="room-card"><summary><strong>${html(room)}</strong><span>${stages.map(([key]) => number(snapshots[key]?.rooms?.[room]?.count)).join(' → ')} players</span><span class="muted">${number(snapshots.final.rooms[room].emptyFirstTeam)} final first-team gaps</span></summary><div class="room-snapshots">${stages.map(([key, label]) => {
    const r = snapshots[key]?.rooms?.[room];
    return `<section><h4>${label}</h4><p class="room-leader">${html(leader(r))}</p><p>${number(r?.count)} players · V1 ${number(r?.V1)}</p><p class="gap-line">Vacancies: ${html(gapText(r))}<br>Beyond modeled depth: ${number(r?.excess)}</p><div class="room-occupants">${(r?.players || []).map(p => `<div>${playerLink(p.index, p.name)}<span>${number(p.overall)} OVR / ${number(p.q1)} q1</span><small>${html(p.position)} · ${p.kind === 'recruit' ? 'Preserved recruit' : p.kind === 'transfer' ? 'Transfer' : 'Veteran'}</small></div>`).join('') || '<p class="muted">Empty room</p>'}</div></section>`;
  }).join('')}</div></details>`).join('')}</div>${recruits.length ? `<details class="preserved-recruits"><summary>Preserved HS/JUCO opportunity · ${recruits.length} commitments</summary><table><thead><tr><th>Player</th><th>POS</th><th>Native</th><th>Post-withdrawal</th><th>Final</th></tr></thead><tbody>${recruits.map(p => `<tr><td>${playerLink(p.index, p.name)}</td><td class="position">${html(p.position)}</td>${stages.map(([key]) => `<td class="number-cell">${number(p[key]?.O1)}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="index-note">First-season opportunity indexes; their commitments remain intact.</p></details>` : ''}</details>`;
}

function poolSheet() {
  const rows = (ui.plan.unplaced || []).filter(r => `${r.name} ${r.pos ?? r.position} ${teamLabel(r.from)}`.toLowerCase().includes(ui.poolSearch.toLowerCase()));
  const pageSize = 50, pages = Math.max(1, Math.ceil(rows.length / pageSize));
  ui.poolPage = Math.min(ui.poolPage, pages - 1);
  const shown = rows.slice(ui.poolPage * pageSize, (ui.poolPage + 1) * pageSize);
  return `<div class="team-sheet-head"><div class="logo-fallback" style="color:var(--accent)">↗</div><div class="team-sheet-title"><div class="eyebrow">THE REMAINING POOL</div><h2>Unplaced transfers</h2><p>Players without a mutually acceptable, feasible offer at the end of this market</p></div><span class="pill">${number(ui.plan.unplaced?.length || 0)} PLAYERS</span></div><div class="pool-toolbar"><input id="pool-search" placeholder="Find a player, position, or school…" value="${html(ui.poolSearch)}"><p>Unplaced does not mean deleted.<br>The game controls subsequent rollover outcomes.</p></div><div class="pool-body">${shown.length ? `<table><thead><tr><th>Player</th><th>POS</th><th>OVR</th><th>Market outcome</th></tr></thead><tbody>${shown.map(r => `<tr><td><button class="player-link" data-action="player" data-player="${r.playerIndex ?? r.index}">${html(r.name)}${r.from ? `<span class="sub">From ${html(teamLabel(r.from))}</span>` : ''}</button></td><td class="position">${html(r.pos ?? r.position)}</td><td class="number-cell">${number(r.ovr ?? r.overall)}</td><td style="text-align:left;font-size:11px;color:var(--muted)">${html(r.reason || 'No acceptable offer')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No players match this search.</div>'}<div class="pagination"><span>${number(rows.length)} players · Page ${ui.poolPage + 1} of ${pages}</span><button class="small quiet" data-action="pool-page" data-page="${ui.poolPage - 1}" ${ui.poolPage === 0 ? 'disabled' : ''}>←</button><button class="small quiet" data-action="pool-page" data-page="${ui.poolPage + 1}" ${ui.poolPage + 1 >= pages ? 'disabled' : ''}>→</button></div></div>`;
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
  return `<div class="drawer-section"><div class="eyebrow">SIMULATED / INDIVIDUAL PREFERENCES</div><p class="traits-note">Generated before offers and held fixed by the seed. These are fictional model traits, not claims about real players, campuses, or people.</p>${factGrid([['Football share of utility', percent(1-p.a-p.b)], ['Social / dating weight', percent(p.a)], ['Ordinary social / dating weight', percent(p.aOrd)], ['Program culture weight', percent(p.b)], ['Exceptional social priority drawn', p.rareLifestyle], ['Outside option', number(p.outside)]])}${pair ? `<details class="detail-disclosure"><summary>How this player and school fit</summary>${factGrid([['Player social preference', number(p.socialIdeal)], ['School social scene', number(school?.socialScene)], ['Simulated dating fit', number(pair.datingFit)], ['Combined social / dating fit', number(pair.L)], ['Player culture preference', number(p.cultureIdeal)], ['School development orientation', percent(school?.d)], ['Program culture fit', number(pair.C)], ['Player residual taste', signed(pair.taste)], ['School residual taste', signed(pair.schoolTaste)], ['Previous-school friction', number(pair.returnFriction)]])}</details>` : ''}${unknowns.length ? `<p class="index-note">${unknowns.map(html).join('<br>')}</p>` : ''}${cf?.applicable ? `<div class="counterfactual"><strong>${cf.decisive ? 'The exceptional priority changed this decision.' : 'The exceptional priority did not change this decision.'}</strong><p>With his ordinary ${percent(p.aOrd)} social weight, ${cf.ordinaryRejectsAccepted ? 'he would reject this accepted offer' : 'this accepted offer still clears his outside option'}. ${cf.ordinaryChoiceChanged ? `His choice among the offers actually made would become ${html(ordinaryDestination)}.` : 'He would choose the same school.'}</p>${!cf.decisive ? '<p>The rare trait is not credited as the cause of this destination.</p>' : ''}</div><details class="detail-disclosure"><summary>Actual-offer counterfactual comparison</summary><table><thead><tr><th>School</th><th>Opportunity</th><th>Actual utility</th><th>Ordinary utility</th></tr></thead><tbody>${(cf.alternatives || []).map(a => `<tr><td>${html(schoolName(a.teamIndex))}</td><td class="number-cell">${number(a.O1)}</td><td class="number-cell">${number(a.U)}</td><td class="number-cell">${number(a.ordinaryU)}${a.ordinaryU <= a.outside ? ' · rejects' : ''}</td></tr>`).join('')}</tbody></table><p class="index-note">This changes only his social weight across the actual offers at decision time; it does not rerun the market or attribute later low opportunity to that weight.</p></details>` : ''}</div>`;
}
function alternativesSection(card) {
  const offers = card.alternatives || [], best = card.decision?.bestStandalone, gap = card.decision?.missedPreferenceGap;
  if (!offers.length && !best) return '';
  return `<div class="drawer-section"><div class="eyebrow">ACTUAL OFFERS AT HIS DECISION</div><table><thead><tr><th>School</th><th>Utility</th><th>Opportunity</th><th>Decision</th></tr></thead><tbody>${offers.map(a => `<tr><td>${html(teamLabel(a.team))}</td><td class="number-cell">${number(a.utility)}</td><td class="number-cell">${number(a.opportunity)}</td><td>${a.accepted ? '<span class="positive">Accepted</span>' : '<span class="muted">Declined</span>'}</td></tr>`).join('')}</tbody></table>${best?.withheldReason ? `<div class="counterfactual"><strong>A willing standalone alternative did not offer</strong><p>${html(best.team)}: utility ${number(best.utility)} and opportunity ${number(best.opportunity)}. ${gap > 0 ? `That is ${number(gap)} utility points above his accepted offer. ` : ''}The school ${html(best.withheldReason)}. This was not an offer he rejected.</p></div>` : ''}</div>`;
}
function releaseSection(card) {
  const r = card.release;
  if (!r) return '';
  return `<div class="drawer-section"><div class="eyebrow">DERIVED / VETERAN RELEASE</div>${factGrid([['Release type', r.kind === 'baseline' ? 'Overage release' : 'Contingent replacement'], ['Marginal modeled loss', number(r.marginalLoss)], ['First-season loss V1', number(r.loss1)], ['Second-season loss V2', number(r.loss2)], ['Room count before release', r.roomCountBefore], ['Minimum protected room coverage', r.coverageFloor]])}<p class="index-note">${r.kind === 'baseline' ? 'This release brings an inherited overage toward 85 while preserving commitments and coverage.' : `This release happens only because ${html(r.forName)} accepted the replacement offer.`} The player remains teamless; the game controls his subsequent fate.</p></div>`;
}
function vetoSection(card) {
  if (!card.vetoes) return '';
  return `<div class="drawer-section"><div class="eyebrow">WHY NO DESTINATION REMAINED</div><table><thead><tr><th>Reason</th><th>Schools</th></tr></thead><tbody>${Object.entries(card.vetoes).sort((a,b) => b[1]-a[1]).map(([reason, count]) => `<tr><td>${html(human(reason))}</td><td class="number-cell">${number(count)}</td></tr>`).join('')}</tbody></table><p class="index-note">These constraints can overlap; the counts are not separate shares of schools.</p>${card.boardOnlyVetoes?.length ? `<p class="why-line later-change">Board capacity alone prevented an otherwise acceptable offer at ${card.boardOnlyVetoes.map(v => html(schoolName(typeof v === 'number' ? v : v.teamIndex))).join(', ')}.</p>` : ''}</div>`;
}
function renderPlayer(card) {
  const opp = card.opportunity;
  const portrait = card.portrait?.src ? `<img class="portrait" src="/${html(card.portrait.src.replace(/^\//, ''))}" alt="">` : `<div class="portrait initials">${html(card.initials || initials(card.name))}</div>`;
  const currentTeam = ui.plan.teams.find(t => t.index === ui.selected);
  const inRow = currentTeam?.in?.find(r => (r.playerIndex ?? r.index) === card.index);
  const outRow = currentTeam?.out?.find(r => (r.playerIndex ?? r.index) === card.index && r.kind !== 'withdrawal');
  const opportunityOrigin = card.status === 'PLACED' ? 'At signing' : 'Native projection';
  const facts = Object.entries(card.facts || {}).map(([key,value]) => [human(key), key === 'development' ? String(value).replace('College_', '') : value]);
  $('#player-content').innerHTML = `<div class="drawer-top"><span class="eyebrow">PLAYER / MARKET REVIEW</span><button class="close-button" data-action="close-player" aria-label="Close player">×</button></div><div class="player-hero">${portrait}<div><span class="pill">${html(card.status)}</span><h2>${html(card.name)}</h2><div class="player-meta"><span>${html(card.pos)}</span><span>${html(card.year)}</span><span>${html(String(card.dev || '').replace('College_', ''))}</span></div></div><div class="ovr-badge"><strong>${number(card.ovr)}</strong><small>OVR</small></div></div><div class="drawer-section"><div class="eyebrow">THE DECISION</div><div class="destination">${card.from ? `${html(card.from.name)}<span class="arrow">→</span>` : ''}${html(card.to?.name || (card.status === 'RELEASED' ? 'Released' : 'Unplaced'))}</div><p class="why-line">${html(card.why)}</p>${card.facts?.originalCPUCommitment ? `<p class="index-note">Original CPU commitment: ${html(card.facts.originalCPUCommitment)}. ${card.to?.name === card.facts.originalCPUCommitment ? 'This school was independently chosen again in the market.' : card.to ? 'Reassigned through an ordinary market offer.' : 'Reopened and left unplaced.'}</p>` : ''}</div>${opp ? `<div class="drawer-section"><div class="eyebrow">DERIVED / OPPORTUNITY</div><div class="opportunity-grid"><div class="opportunity-box"><label>First-season opportunity</label><div class="readout">${number(opp.initial)}<span>→</span>${number(opp.final)}</div><small>${opportunityOrigin} → final roster</small></div><div class="opportunity-box"><label>Future scenario</label><div class="readout">${number(opp.futureInitial)}<span>→</span>${number(opp.futureFinal)}</div><small>${opportunityOrigin} → final roster</small></div></div><p class="index-note">Opportunity is an index, not a probability or snap share. The future scenario does not guarantee unchanged future recruiting.</p>${card.contract ? `<p class="contract-line">Acceptance commitment: <strong>${html(human(card.contract))}</strong></p>` : ''}${competitorSection(card)}</div>` : ''}${decisionSection(card)}${releaseSection(card)}${vetoSection(card)}${alternativesSection(card)}${forecastSection(card)}${facts.length ? `<div class="drawer-section"><div class="eyebrow">OBSERVED / FROM THE SAVE</div>${factGrid(facts)}</div>` : ''}${simulationSection(card)}${card.undos?.length || inRow || outRow ? `<div class="drawer-section"><div class="eyebrow">YOUR CONSTRAINTS</div><div class="drawer-actions">${inRow ? `<button data-action="undo" data-kind="in" data-player="${card.index}" data-team="${currentTeam.index}">Exclude ${html(currentTeam.name)} pairing</button>` : ''}${outRow ? `<button data-action="undo" data-kind="out" data-player="${card.index}" data-team="${currentTeam.index}">Keep player at ${html(currentTeam.name)}</button>` : ''}${(card.undos || []).map(u => `<span class="pill">${html(u.undone)} · ${html(u.at)}</span>`).join('')}</div><p class="index-note">A constraint rebuilds the market with the same seed. Other player outcomes may also change.</p></div>` : ''}`;
}

async function loadPlayer(index) {
  if (ui.busy) return;
  error('');
  if (!dialog.open) dialog.showModal();
  $('#player-content').innerHTML = '<div class="drawer-top"><span class="eyebrow">PLAYER / MARKET REVIEW</span><button class="close-button" data-action="close-player">×</button></div><div class="drawer-loading">Loading player review…</div>';
  try { const card = await api(`/api/player?index=${encodeURIComponent(index)}`); ui.card = card; renderPlayer(card); } catch (e) { $('#player-content').innerHTML = `<div class="drawer-top"><span class="eyebrow">PLAYER REVIEW</span><button class="close-button" data-action="close-player">×</button></div><div class="drawer-loading">${html(e.message)}</div>`; }
}

async function refreshSaves() { ui.saves = await api('/api/saves'); renderWelcome(); }
async function openSave(path) { ui.opened = await api('/api/open', { path }); ui.plan = null; renderTeamPicker(); }
async function mutate(endpoint, body, message = 'Rebuilding the market…') { await work(message, async () => { acceptPlan(await api(endpoint, body)); }); }

document.addEventListener('submit', event => {
  const form = event.target;
  if (!['open-form','team-form','seed-form'].includes(form.id)) return;
  event.preventDefault();
  if (form.id === 'open-form') {
    const path = new FormData(form).get('path');
    work('Opening save…', () => openSave(path));
  }
  if (form.id === 'team-form') {
    const data = new FormData(form), raw = data.get('teamIndex');
    if (raw === '' || raw === null) return error('Select your team before building the market.');
    const seed = String(data.get('seed') || '').trim();
    mutate('/api/user-team', { teamIndex: Number(raw), ...(seed ? { seed } : {}) }, 'Building the CPU market…');
  }
  if (form.id === 'seed-form') {
    const seed = String(new FormData(form).get('seed') || '').trim();
    if (!seed) return error('Enter a seed to replan.');
    mutate('/api/replan', { seed });
  }
});

document.addEventListener('change', event => {
  if (event.target.id !== 'user-team') return;
  const value = event.target.value;
  $('#build-button').disabled = value === '';
  const team = value === '' ? null : ui.opened.teams.find(t => t.index === Number(value));
  $('#selection-preview').innerHTML = team ? `<div class="selection-preview">${logo(team)}<div><strong>${html(team.name)}</strong><p>Roster and all commitments protected</p></div></div>` : '';
});

document.addEventListener('input', event => {
  if (event.target.id === 'school-search') { ui.search = event.target.value; $('#school-list').innerHTML = schoolList(); }
  if (event.target.id === 'pool-search') {
    ui.poolSearch = event.target.value; ui.poolPage = 0;
    const position = event.target.selectionStart;
    $('#team-sheet').innerHTML = poolSheet();
    $('#pool-search').focus(); $('#pool-search').setSelectionRange(position, position);
  }
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'close-player') { dialog.close(); return; }
  if (ui.busy) return;
  if (action === 'home') {
    ui.plan = null; ui.opened = null; ui.selected = null; ui.card = null;
    if (dialog.open) dialog.close();
    work('Loading saves…', refreshSaves);
  }
  if (action === 'refresh-saves') work('Loading saves…', refreshSaves);
  if (action === 'open-listed') work('Opening save…', () => openSave(ui.saves[Number(button.dataset.save)].path));
  if (action === 'select-team') { ui.selected = Number(button.dataset.team); $('#school-list').innerHTML = schoolList(); $('#team-sheet').innerHTML = selectedSheet(); document.querySelector('.pool-button').classList.remove('active'); }
  if (action === 'select-pool') { ui.selected = 'pool'; $('#school-list').innerHTML = schoolList(); $('#team-sheet').innerHTML = poolSheet(); button.classList.add('active'); }
  if (action === 'filter') { ui.filter = button.dataset.filter; document.querySelectorAll('.rail-filter button').forEach(b => b.classList.toggle('active', b === button)); $('#school-list').innerHTML = schoolList(); }
  if (action === 'pool-page') { ui.poolPage = Number(button.dataset.page); $('#team-sheet').innerHTML = poolSheet(); }
  if (action === 'player') loadPlayer(Number(button.dataset.player));
  if (action === 'undo') mutate('/api/undo', { playerIndex: Number(button.dataset.player), teamIndex: Number(button.dataset.team), kind: button.dataset.kind });
  if (action === 'restore') mutate('/api/restore', { playerIndex: Number(button.dataset.player), teamIndex: Number(button.dataset.team) });
  if (action === 'review') mutate('/api/review', { teamIndex: Number(button.dataset.team), reviewed: button.dataset.reviewed === 'true' }, 'Updating review…');
  if (action === 'save') work('Saving, then reopening for verification…', async () => { const fileName = ui.plan.save.fileName; const result = await api('/api/save', { planId: ui.plan.id }); ui.plan = null; ui.opened = null; renderWelcome({ ...result, fileName }); });
  if (action === 'export') { const blob = new Blob([JSON.stringify(ui.plan, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `signing-day-${String(ui.plan.seed).replace(/[^a-z0-9-]/gi, '-')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Review exported.'); }
});

dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
work('Loading saves…', refreshSaves);
