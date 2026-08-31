import { CoordinateMap } from '../types';

import { RPA as caRPA } from './ca/rpa';
import { SCO as caSCO } from './ca/sco';
import { BCO as caBCO } from './ca/bco';
import { AD as caAD } from './ca/ad';
import { AVID as caAVID } from './ca/avid';
import { BIA as caBIA } from './ca/bia';
import { TDS as caTDS } from './ca/tds';
import { SPQ as caSPQ } from './ca/spq';
import { FRR_PA as caFRRPA } from './ca/frr-pa';
import { PRBS as caPRBS } from './ca/prbs';
import { WFA as caWFA } from './ca/wfa';
import { SMCO as caSMCO } from './ca/smco';
import { SMCO_WITH_ADDENDUM as caSMCOWithAddendum } from './ca/smco-with-addendum';

const registry: Record<string, CoordinateMap> = {
  'ca/RPA': caRPA,
  'ca/SCO': caSCO,
  'ca/BCO': caBCO,
  'ca/AD': caAD,
  'ca/AVID': caAVID,
  'ca/BIA': caBIA,
  'ca/TDS': caTDS,
  'ca/SPQ': caSPQ,
  'ca/SMCO': caSMCO,
  'ca/SMCO-WITH-ADDENDUM': caSMCOWithAddendum,
  'ca/FRR-PA': caFRRPA,
  'ca/PRBS': caPRBS,
  'ca/WFA': caWFA,
};

export function getCoordinates(formCode: string, state = 'ca'): CoordinateMap {
  const key = `${state.toLowerCase()}/${formCode.toUpperCase()}`;
  const map = registry[key];
  if (!map) {
    throw new Error(`No coordinate map registered for ${key}`);
  }
  return map;
}
