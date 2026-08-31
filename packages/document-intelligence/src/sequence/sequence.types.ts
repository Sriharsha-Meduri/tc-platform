export type FormFamilyId = 'counter_offer';

export interface FormFamily {
  id: FormFamilyId;
  formCodes: string[];
  crossMemberAction: 'superseded';
}
