import { FORMATIONS } from './formations'
import type { Lineup, Player, Slot } from './types'

function slotsFor(formation: string) {
  const slots = FORMATIONS[formation]
  if (!slots) throw new Error(`Unknown formation: ${formation}`)
  return slots
}

export function emptyLineup(formation: string): Lineup {
  return Object.fromEntries(slotsFor(formation).map(slot => [slot.id, null]))
}

export function visibleLineup(lineup: Lineup, formation: string): Lineup {
  return Object.fromEntries(slotsFor(formation).map(slot => [slot.id, lineup[slot.id] ?? null]))
}

export function firstAvailableSlot(formation: string, lineup: Lineup): Slot {
  const slots = slotsFor(formation)
  return slots.find(slot => !lineup[slot.id])?.id ?? slots[0]!.id
}

export function resolveActiveSlot(formation: string, lineup: Lineup, preferred: Slot): Slot {
  const slots = slotsFor(formation)
  if (slots.some(slot => slot.id === preferred)) return preferred
  return firstAvailableSlot(formation, lineup)
}

export function lineupFilledCount(lineup: Lineup, formation: string): number {
  return slotsFor(formation).filter(slot => Boolean(lineup[slot.id])).length
}

export function isLineupComplete(lineup: Lineup, formation: string): boolean {
  return lineupFilledCount(lineup, formation) === slotsFor(formation).length
}

export function lineupHasPlayer(lineup: Lineup, formation: string, historicalId: string): boolean {
  return slotsFor(formation).some(slot => lineup[slot.id]?.id === historicalId)
}

export function assignPlayer(
  lineup: Lineup,
  formation: string,
  preferredSlot: Slot,
  player: Player,
): { lineup: Lineup; selectedSlot: Slot; nextSlot: Slot } {
  const selectedSlot = resolveActiveSlot(formation, lineup, preferredSlot)
  const nextLineup = visibleLineup(lineup, formation)
  nextLineup[selectedSlot] = player
  const nextSlot = slotsFor(formation).find(slot => !nextLineup[slot.id])?.id ?? selectedSlot
  return { lineup: nextLineup, selectedSlot, nextSlot }
}

export function remapLineup(lineup: Lineup, sourceFormation: string, targetFormation: string): Lineup {
  const sourceSlots = slotsFor(sourceFormation)
  const targetSlots = slotsFor(targetFormation)
  const nextLineup = emptyLineup(targetFormation)
  const remaining = sourceSlots
    .map(slot => ({ slot, player: lineup[slot.id] }))
    .filter((entry): entry is { slot: typeof sourceSlots[number]; player: Player } => Boolean(entry.player))

  for (let index = remaining.length - 1; index >= 0; index -= 1) {
    const entry = remaining[index]!
    if (!targetSlots.some(slot => slot.id === entry.slot.id)) continue
    nextLineup[entry.slot.id] = entry.player
    remaining.splice(index, 1)
  }

  for (let index = 0; index < remaining.length;) {
    const entry = remaining[index]!
    const target = targetSlots.find(slot => !nextLineup[slot.id] && slot.role === entry.slot.role)
    if (!target) {
      index += 1
      continue
    }
    nextLineup[target.id] = entry.player
    remaining.splice(index, 1)
  }

  const openSlots = targetSlots.filter(slot => !nextLineup[slot.id])
  remaining.forEach((entry, index) => {
    nextLineup[openSlots[index]!.id] = entry.player
  })
  return nextLineup
}
