// Original story content: radio dialogue, intel logs and mission text for "Beyond the Fold".

export interface Speaker {
  id: string;
  name: string;
  role: string;
  color: string;
}

export const SPEAKERS: Record<string, Speaker> = {
  kestrel: { id: 'kestrel', name: 'KESTREL', role: 'Warden-Commando', color: '#ffb36b' },
  overwatch: { id: 'overwatch', name: 'OVERWATCH', role: 'Lt. Cmdr. Ines Varga · CSV Lantern', color: '#7fd4ff' },
  heron: { id: 'heron', name: 'HERON-2', role: 'Lt. Tamsin Okoro · Pilot', color: '#ffe07a' },
  wren: { id: 'wren', name: 'WREN', role: 'Suit Tactical Intelligence', color: '#9dffd8' },
};

export interface RadioLine {
  id: string;
  speaker: keyof typeof SPEAKERS;
  text: string;
}

const L = (id: string, speaker: RadioLine['speaker'], text: string): RadioLine => ({ id, speaker, text });

export const RADIO: Record<string, RadioLine> = Object.fromEntries(
  [
    L('intro_1', 'heron', 'Overwatch, Heron Two. Crossing the Teskaris terminator. Halden Station is still dark on every band.'),
    L('intro_2', 'overwatch', 'Copy, Heron. Forty hours of silence from a post that never misses a check-in. Kestrel — you awake back there?'),
    L('intro_3', 'kestrel', 'Awake.'),
    L('intro_4', 'heron', 'Contact below — plasma flak! Hold on to something!'),
    L('intro_5', 'heron', "We're hit — going down! Brace, brace!"),
    L('wake_1', 'wren', 'Impact survived. Shield capacitor rebooting... armor integrity nominal.'),
    L('wake_2', 'heron', "Kestrel... it's Tam. Legs are pinned, but I'm breathing. Don't you dare carry me."),
    L('wake_3', 'overwatch', 'Kestrel, Overwatch. We have your beacon. Halden Station is two kilometers east. Find out what happened to our people.'),
    L('lane_hint', 'wren', 'Wreckage spread across the ridge. Something is transmitting from the debris behind you.'),
    L('intel_found', 'wren', 'Data recovered. Uploading to Lantern.'),
    L('contact_1', 'wren', 'Movement ahead. Non-human biosignatures.'),
    L('contact_2', 'overwatch', "Those are Thren — assault-caste infantry. They shouldn't be within ten light-years of this colony."),
    L('drone_1', 'heron', "That's a Halden Watchdog — station security. Wait... it's targeting you?"),
    L('drone_2', 'overwatch', "It's firing on the Thren too. Its friend-or-foe is scrambled. Treat every contact as hostile."),
    L('clear_b', 'kestrel', 'Area clear. Moving east.'),
    L('chasm_1', 'wren', 'Laminated shale ahead. It fractures under load — keep moving.'),
    L('vent_1', 'wren', 'Geothermal plasma vents. Watch the pulse rhythm.'),
    L('cache_found', 'wren', 'Concord supply cache. Requisition credited.'),
    L('cp_1', 'wren', 'Checkpoint beacon deployed. Telemetry synced to Lantern.'),
    L('cp_2', 'overwatch', "Halden's perimeter outpost is just ahead. Their last transmission came from there."),
    L('out_1', 'overwatch', "Heavy Thren presence at the outpost, Kestrel. They're dug in."),
    L('out_2', 'kestrel', "Then I'll dig them out."),
    L('out_3', 'heron', "Hangar doors opening — more Watchdogs! They're not picking sides!"),
    L('out_4', 'wren', 'Warning: heavy biosignatures inbound. Ravager-caste. Do not let them close the distance.'),
    L('out_5', 'overwatch', "Outpost secured. Good work. Halden's main yard is just past the ridge."),
    L('bulwark_hint', 'wren', 'Hard-light barrier detected. Flank it, overcharge it with plasma, or go over the top.'),
    L('yard_1', 'wren', 'Heavy ordnance locker detected. Recommend acquisition.'),
    L('yard_2', 'overwatch', "Kestrel... seismic readings under the yard. Something big is moving inside that hangar."),
    L('boss_1', 'heron', "Is that — that's a CX-90 Colossus! Station defense walker. It's supposed to be mothballed!"),
    L('boss_2', 'overwatch', "It's broadcasting the same corrupted signal as the drones. Put it down, Kestrel."),
    L('boss_tank', 'overwatch', 'Those fuel cells! Light one up when it gets close!'),
    L('boss_armor', 'wren', 'Chest armor breached. Reactor core exposed — focus fire.'),
    L('boss_phase3', 'wren', "Core temperature critical. It's getting desperate."),
    L('boss_ammo', 'wren', 'The ordnance locker restocks every twenty seconds.'),
    L('end_1', 'kestrel', 'Colossus is down.'),
    L('end_2', 'overwatch', 'Kestrel — seismic spike. Massive. Something just woke up beneath Halden.'),
    L('end_3', 'wren', 'Spatial distortion rising. The ground is... folding.'),
    L('end_4', 'heron', 'Kestrel. Look at the sky.'),
    L('end_5', 'overwatch', "That structure isn't Thren, and it isn't ours. Whatever Halden found down there — it just opened."),
    L('end_6', 'kestrel', "Then I'm going in."),
    L('death_1', 'wren', 'Vital signs lost. Restoring from last checkpoint.'),
  ].map((l) => [l.id, l]),
);

export interface IntelDef {
  id: string;
  title: string;
  author: string;
  body: string;
}

export const INTEL: Record<string, IntelDef> = {
  intel_heron: {
    id: 'intel_heron',
    title: 'HERON-2 FLIGHT RECORDER',
    author: 'Lt. Tamsin Okoro — personal log',
    body:
      "Third run to Teskaris this year. Halden always has coffee waiting and a joke from Dr. Sen about the 'paper mountains.' " +
      'Funny thing is, the ridges really do look folded from up here — like someone creased the whole planet along one line and pressed it flat. ' +
      'No answer on approach today. Probably a dish fault. Probably.',
  },
  intel_sen: {
    id: 'intel_sen',
    title: 'HALDEN RESEARCH LOG — DAY 211',
    author: 'Dr. Amara Sen, Principal Investigator',
    body:
      'The structure beneath Sublevel 4 is not carved and it is not cast. It is folded: a single continuous surface, creased into geometry ' +
      'our instruments insist cannot fit inside itself. When we powered the survey lattice, every crease lit at once. ' +
      'I no longer think Teskaris is hiding this thing. I think Teskaris is the wrapping.',
  },
  intel_override: {
    id: 'intel_override',
    title: 'SECURITY NOTICE — AUTOMATED DEFENSE',
    author: 'Halden Station Security Core',
    body:
      'Priority override received on all Watchdog and Colossus units. Source: UNKNOWN. Authentication: geometric. ' +
      'The instruction set does not use language; it uses shapes. Units report a single directive, translated as closely as possible: ' +
      'KEEP THE DOOR CLOSED UNTIL IT OPENS.',
  },
};

export const MISSION_TEXT = {
  m01: {
    number: 'MISSION 01',
    name: 'LANDFALL',
    location: 'TESKARIS · HALDEN BASIN',
    briefing:
      'Halden Deep Research Station has been silent for forty hours. Concord Command is sending one Warden-Commando ' +
      'to find out why. Insert by dropship, make contact with station personnel, and report.',
  },
};
