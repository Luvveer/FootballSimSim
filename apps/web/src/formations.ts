import type { PitchRole } from '@footballsimsim/shared'

export type SlotRole = PitchRole
export type SlotDef = { id: string; role: SlotRole; left: number; top: number }

const gk: SlotDef = { id: 'GK', role: 'GK', left: 50, top: 86 }

export const FORMATIONS: Record<string, SlotDef[]> = {
  '1-2-1': [
    { id: 'ST', role: 'FWD', left: 50, top: 14 },
    { id: 'LM', role: 'MID', left: 25, top: 38 },
    { id: 'RM', role: 'MID', left: 75, top: 38 },
    { id: 'CB', role: 'DEF', left: 50, top: 62 },
    gk,
  ],
  '2-1-1': [
    { id: 'ST', role: 'FWD', left: 50, top: 14 },
    { id: 'CM', role: 'MID', left: 50, top: 40 },
    { id: 'LCB', role: 'DEF', left: 28, top: 64 },
    { id: 'RCB', role: 'DEF', left: 72, top: 64 },
    gk,
  ],
  '1-1-2': [
    { id: 'LST', role: 'FWD', left: 32, top: 14 },
    { id: 'RST', role: 'FWD', left: 68, top: 14 },
    { id: 'CM', role: 'MID', left: 50, top: 40 },
    { id: 'CB', role: 'DEF', left: 50, top: 64 },
    gk,
  ],
  '2-0-2': [
    { id: 'LST', role: 'FWD', left: 32, top: 16 },
    { id: 'RST', role: 'FWD', left: 68, top: 16 },
    { id: 'LCB', role: 'DEF', left: 28, top: 58 },
    { id: 'RCB', role: 'DEF', left: 72, top: 58 },
    gk,
  ],
  '3-0-1': [
    { id: 'ST', role: 'FWD', left: 50, top: 16 },
    { id: 'LCB', role: 'DEF', left: 20, top: 58 },
    { id: 'CB', role: 'DEF', left: 50, top: 62 },
    { id: 'RCB', role: 'DEF', left: 80, top: 58 },
    gk,
  ],
}

export const DEFAULT_FORMATION = '1-2-1'

const ROLE_LABELS: Record<SlotRole, string> = { GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'FWD' }
const SLOT_ROLES = new Map(Object.values(FORMATIONS).flat().map(slot => [slot.id, slot.role]))

export const roleLabel = (role: SlotRole) => ROLE_LABELS[role]
export const slotLabel = (slotId: string) => ROLE_LABELS[SLOT_ROLES.get(slotId) ?? 'MID']
