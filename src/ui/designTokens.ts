import type { TeamId } from '../shared/types';

/**
 * STRIKE OPS — Grounded Tactical Realism & Modern Military Command Center Design Tokens.
 * Internal protocol retains TeamId ('blue' | 'red') for full save & map-spawn compatibility,
 * while presenting original factions: TASK FORCE (#4FD1FF) vs VIPER UNIT (#FFB020).
 */

export interface TeamVisualIdentity {
  id: TeamId;
  code: string;
  name: string;
  thaiName: string;
  accentHex: string;
  accentInt: number;
  secondaryHex: string;
  uniformTintInt: number;
  textClass: string;
  softTextClass: string;
  bgBarClass: string;
  borderClass: string;
  headerGradientClass: string;
  slotBadgeClass: string;
  hoverEmptyClass: string;
  minimapHex: string;
  strokeHex: string;
}

export const TEAM_IDENTITY: Record<TeamId, TeamVisualIdentity> = {
  blue: {
    id: 'blue',
    code: 'TF',
    name: 'TASK FORCE',
    thaiName: 'หน่วยทาสก์ฟอร์ซ',
    accentHex: '#4FD1FF',
    accentInt: 0x4fd1ff,
    secondaryHex: '#6F8268',
    uniformTintInt: 0x55644e,
    textClass: 'text-[#4FD1FF]',
    softTextClass: 'text-sky-300',
    bgBarClass: 'bg-[#4FD1FF]',
    borderClass: 'border-[#4FD1FF]/35',
    headerGradientClass:
      'bg-gradient-to-r from-[#4FD1FF]/20 via-[#4FD1FF]/8 to-transparent border-b border-[#4FD1FF]/25',
    slotBadgeClass: 'bg-[#4FD1FF]/15 text-[#4FD1FF] border-[#4FD1FF]/35',
    hoverEmptyClass: 'hover:bg-[#4FD1FF]/[0.08] hover:border-[#4FD1FF]/50',
    minimapHex: '#4FD1FF',
    strokeHex: '#93e5ff',
  },
  red: {
    id: 'red',
    code: 'VP',
    name: 'VIPER UNIT',
    thaiName: 'หน่วยไวเปอร์',
    accentHex: '#FFB020',
    accentInt: 0xffb020,
    secondaryHex: '#2B303A',
    uniformTintInt: 0x2a2f38,
    textClass: 'text-[#FFB020]',
    softTextClass: 'text-amber-300',
    bgBarClass: 'bg-[#FFB020]',
    borderClass: 'border-[#FFB020]/35',
    headerGradientClass:
      'bg-gradient-to-r from-[#FFB020]/20 via-[#FFB020]/8 to-transparent border-b border-[#FFB020]/25',
    slotBadgeClass: 'bg-[#FFB020]/15 text-[#FFB020] border-[#FFB020]/35',
    hoverEmptyClass: 'hover:bg-[#FFB020]/[0.08] hover:border-[#FFB020]/50',
    minimapHex: '#FFB020',
    strokeHex: '#fcd34d',
  },
};

export function getTeamIdentity(team: TeamId): TeamVisualIdentity {
  return team === 'red' ? TEAM_IDENTITY.red : TEAM_IDENTITY.blue;
}

export const BRAND_NAME = 'STRIKE OPS';
export const BRAND_SUBTITLE = 'TACTICAL 3D FPS';
