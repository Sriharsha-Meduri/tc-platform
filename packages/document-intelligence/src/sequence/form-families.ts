import type { FormFamily } from './sequence.types';

export const FORM_FAMILIES: FormFamily[] = [
  {
    id: 'counter_offer',
    formCodes: ['SCO', 'BCO', 'SMCO', 'BMCO'],
    crossMemberAction: 'superseded',
  },
];
