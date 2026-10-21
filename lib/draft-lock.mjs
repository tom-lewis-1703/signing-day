// Phase 1: Draft lock. Only players out of eligibility (Senior, not redshirting
// this year) may leave early for the NFL. Everyone else has every early-draft
// record set to Staying with the persuasion marked used, the same values the
// game writes when you persuade a player. The user's team is left out and
// portal decisions are left alone.

function describe(d, p) {
  return {
    recordIndex: p.index,
    name: p.name,
    position: p.position,
    overall: p.overall,
    schoolYear: p.schoolYear,
    redshirtStatus: p.redshirt,
    teamIndex: p.team,
    team: d.teamName(p.team),
    projectedRound: Math.min(...p.nflRows.map(r => Number(r.ProjectRound) || 8)),
    statuses: p.nflRows.map(r => String(r.LeaveStatus || "")),
    alsoEnteringPortal: p.enteringPortal
  };
}

const byOverall = (a, b) => b.overall - a.overall || a.team.localeCompare(b.team) || a.name.localeCompare(b.name);

// Read-only: who the lock would change on this save.
export function planDraftLock(d, userTeamIndex) {
  const toLock = [], graduating = [], userTeam = [], alreadyStaying = [];
  for (const p of d.players) {
    if (!p.nflRows.length) continue;
    const info = describe(d, p);
    if (p.outOfEligibility) graduating.push(info);
    else if (userTeamIndex != null && p.team === userTeamIndex) userTeam.push(info);
    else if (info.statuses.every(s => s === "Staying")) alreadyStaying.push(info);
    else toLock.push(info);
  }

  const teamCounts = new Map();
  for (const p of toLock) teamCounts.set(p.team, (teamCounts.get(p.team) || 0) + 1);

  return {
    toLock: toLock.sort(byOverall),
    graduating: graduating.sort(byOverall),
    userTeam: userTeam.sort(byOverall),
    alreadyStaying: alreadyStaying.sort(byOverall),
    byTeam: [...teamCounts].map(([team, count]) => ({ team, count })).sort((a, b) => b.count - a.count || a.team.localeCompare(b.team)),
    alsoEnteringPortal: toLock.filter(p => p.alsoEnteringPortal).length
  };
}

// Applies the plan in memory, then re-reads every affected player to verify.
export function applyDraftLock(d, userTeamIndex) {
  const plan = planDraftLock(d, userTeamIndex);
  for (const info of plan.toLock) {
    const p = d.playerByIndex.get(info.recordIndex);
    for (const row of p.nflRows) {
      row.LeaveStatus = "Staying";
      row.PersuadeAttempts = Math.max(Number(row.PersuadeAttempts) || 0, 1);
    }
    d.refreshPlayer(p);
  }

  const problems = [];
  const after = planDraftLock(d, userTeamIndex);
  if (after.toLock.length) problems.push(`${after.toLock.length} underclassmen are still set to leave`);
  for (const info of plan.toLock) {
    const p = d.playerByIndex.get(info.recordIndex);
    if (p.leavingForDraft || !p.nflRows.every(r => String(r.LeaveStatus) === "Staying" && Number(r.PersuadeAttempts) >= 1)) {
      problems.push(`${info.name} (${info.team}) did not lock`);
    }
  }
  const untouched = list => list.every(info =>
    d.playerByIndex.get(info.recordIndex).nflRows.map(r => String(r.LeaveStatus)).join() === info.statuses.join());
  if (!untouched(plan.graduating)) problems.push("a graduating player's draft status changed");
  if (!untouched(plan.userTeam)) problems.push("a player on your team was changed");

  return { locked: plan.toLock, plan, verified: problems.length === 0, problems };
}
