// One consistent line-icon set (24x24, stroke = currentColor). Replaces emoji, which render
// differently on every phone.

const D: Record<string, string> = {
  // relics
  war_drums: 'M4 9a8 3 0 1 0 16 0a8 3 0 1 0-16 0M4 9v7a8 3 0 0 0 16 0V9M7 3l4 5M17 3l-4 5',
  eagle_eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  thick_skin: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6zM12 8v8M8 12h8',
  brood_mother: 'M12 3c4 0 7 6 7 11a7 7 0 0 1-14 0c0-5 3-11 7-11zM9 13l2 2 2-2 2 2',
  bounty_board: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M15 9h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9M12 6v2M12 17v1',
  piggy_bank: 'M5 12a7 6 0 1 0 14 0a7 6 0 1 0-14 0M19 11h2M8 17v3M16 17v3M10 7h4M9 11h.01',
  gravedigger: 'M12 3v10M8 13h8v3a4 4 0 0 1-8 0zM9 3h6',
  vanguard_banner: 'M6 21V3M6 4h12l-3 4 3 4H6',
  mitosis: 'M2 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0',
  shield_quiver: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 12h.01',
  grave_pact: 'M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z',
  soul_harvest: 'M6 20V10a6 6 0 0 1 12 0v10l-2-2-2 2-2-2-2 2-2-2zM10 10h.01M14 10h.01',
  catapult_arms: 'M3 20h18M7 20l5-7 3 7M12 13L19 5M18 3a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  blood_frenzy: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 2 3 3 0-2 0-4 0-6z',
  arcane_resonance: 'M12 3l6 6-6 12-6-12zM6 9h12M12 3v18',
  commanders_horn: 'M4 10v4h3l9 5V5l-9 5zM19 9a4 4 0 0 1 0 6',
  war_chant: 'M9 18V5l10-2v13M4 18a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M14 16a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
  titan_blood: 'M7 3c0 6 10 6 10 12s-10 3-10 6M17 3c0 6-10 6-10 12M9 6h6M9 18h6',
  barracks: 'M4 21V9h3V6h3v3h4V6h3v3h3v12zM10 21v-5h4v5',
  strength_in_numbers: 'M5 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M13 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M2 20c0-4 3-6 6-6s6 2 6 6M14 14.5c1-.3 1.5-.5 2-.5 3 0 6 2 6 6',
  echo_stone: 'M4 12a8 8 0 0 1 14-5M20 12a8 8 0 0 1-14 5M18 3v4h-4M6 21v-4h4',
  chain_reaction: 'M10 14l4-4M8 11l-2 2a3.5 3.5 0 0 0 5 5l2-2M16 13l2-2a3.5 3.5 0 0 0-5-5l-2 2',
  sky_hammer: 'M11 9a4 4 0 1 0 8 0a4 4 0 1 0-8 0M3 21l9-9M3 15l5-5M9 21l5-5',
  lich_crown: 'M3 19h18M4 19L3 7l5 4 4-6 4 6 5-4-1 12',
  hail_of_arrows: 'M6 3v10M3 10l3 3 3-3M12 7v12M9 16l3 3 3-3M18 3v10M15 10l3 3 3-3',
  // commands
  charge: 'M4 4l11 11M20 4L9 15M14 14l5 5M10 14l-5 5M17 17l3-3M7 17l-3-3',
  hold: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
  volley: 'M5 19L19 5M14 5h5v5M5 5c6 0 14 8 14 14',
  rally: 'M6 14l6-6 6 6M6 20l6-6 6 6M12 3v3',
  meteor: 'M11 9a4 4 0 1 0 8 0a4 4 0 1 0-8 0M3 21l9-9M3 15l5-5M9 21l5-5',
  raise: 'M12 3a7 7 0 0 0-7 7c0 3 2 4 2 6v2h10v-2c0-2 2-3 2-6a7 7 0 0 0-7-7zM9 11h1M14 11h1M10 21v-3M14 21v-3',
  burst: 'M2 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0',
  // ui
  coin: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10',
  gear: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  pause: 'M8 5v14M16 5v14',
  menu: 'M4 6h16M4 12h16M4 18h16',
  play: 'M7 4l13 8-13 8z',
  sound: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12',
  mute: 'M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6',
  bug: 'M8 8a4 4 0 0 1 8 0v8a4 4 0 0 1-8 0zM4 12h4M16 12h4M5 6l3 2M19 6l-3 2M5 18l3-2M19 18l-3-2',
  dice: 'M4 4h16v16H4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01',
  plus: 'M12 5v14M5 12h14',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  close: 'M6 6l12 12M18 6L6 18',
  heart: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z',
  sword: 'M14 4h6v6L9 21l-6-6zM5 13l6 6',
  skull: 'M12 3a7 7 0 0 0-7 7c0 3 2 4 2 6v2h10v-2c0-2 2-3 2-6a7 7 0 0 0-7-7zM9 11h1M14 11h1M10 21v-3M14 21v-3',
  numbers: 'M4 9h4v10M14 9h5l-5 10M10 5h4',
  flag: 'M6 21V3M6 4h12l-3 4 3 4H6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8',
  crown: 'M3 19h18M4 19L3 7l5 4 4-6 4 6 5-4-1 12',
  rotate: 'M4 12a8 8 0 0 1 14-5l2 2M20 4v5h-5M20 12a8 8 0 0 1-14 5l-2-2M4 20v-5h5',
};

const FILLED = new Set(['play']);

export function Icon({ name, size = '1em', class: cls = '' }: { name: string; size?: string; class?: string }) {
  const d = D[name] ?? D.coin;
  const filled = FILLED.has(name);
  return (
    <svg class={'icon ' + cls} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={d} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" stroke-width={2.2} stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}
