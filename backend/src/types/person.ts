// Person interface
export interface Person {
  personId: string;
  name: string;
  faceImagePath: string | null;
  fingerprints: string[];
  cardNumbers: string[];
  createdAt: string;
  updatedAt: string;
}

// Person creation input
export interface PersonInput {
  personId?: string;
  name?: string;
  fingerprints?: string[];
  cardNumbers?: string[];
}

// Person update input
export interface PersonUpdate extends Partial<PersonInput> {}
