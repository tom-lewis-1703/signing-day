// Free board/roster space only when a low-rated incoming freshman has no marginal
// current or future value. The original future floor survives later arrivals.
import { ROOMS, cmp, byId, roomValue, surplusFreshman } from "./market-model.mjs";

export const recruitFutureFloors = (roster, slots) => Object.fromEntries(ROOMS.map(room => [room,
  Math.min(roster.filter(p => p.room === room && p.E >= 2).length, slots[room].S ? slots[room].S + 1 : slots[room].support)]));

export function cleanupRecruits(roster, slots, futureFloors, keep) {
  const removed = [];
  for (const room of ROOMS) {
    let members = roster.filter(p => p.room === room);
    const depth = slots[room].h.length;
    while (members.length > depth) {
      const before = roomValue(members, slots[room]);
      const choices = members.filter(p => surplusFreshman(p) && !keep.has(p.index))
        .sort((a, b) => a.overall - b.overall || (a.q2 ?? 0) - (b.q2 ?? 0) || byId(a, b));
      let chosen = null;
      for (const p of choices) {
        const after = members.filter(x => x.id !== p.id), value = roomValue(after, slots[room]);
        if (after.filter(x => x.E >= 2).length < futureFloors[room]) continue;
        if (cmp(before.V1, value.V1) || cmp(before.V2, value.V2)) continue;
        chosen = { p, loss1: before.V1 - value.V1, loss2: before.V2 - value.V2,
          roomCountBefore: members.length, coverageFloor: depth, futureFloor: futureFloors[room],
          futureCountAfter: after.filter(x => x.E >= 2).length };
        break;
      }
      if (!chosen) break;
      removed.push(chosen);
      members = members.filter(p => p.id !== chosen.p.id);
    }
  }
  const ids = new Set(removed.map(c => c.p.id));
  return { roster: roster.filter(p => !ids.has(p.id)), removed };
}
