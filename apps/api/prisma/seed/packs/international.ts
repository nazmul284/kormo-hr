import type { DemoPack } from './types';

/**
 * The default demo tenant: a deliberately placeless, multinational
 * company. Names are drawn from across the world because "international"
 * with a single-culture staff list is not international, it is just
 * somewhere else's default.
 *
 * The city, Northport, does not exist. Its coordinates sit in the North
 * Sea, which keeps the field-force map plausible-looking without putting
 * fictional pharmacies on top of a real town.
 */
export const INTERNATIONAL_DEMO: DemoPack = {
  country: 'INTL',

  /** Multiplier on the shared salary table — scales the baseline table into USD. */
  salaryScale: 0.04,

  tenant: {
    name: 'Meridian Health Group',
    alias: 'meridian',
    tagPrefix: 'MHG',
    domain: 'meridian.example',
    secondName: 'Meridian Logistics',
    secondAlias: 'meridian-logistics',
  },

  nationality: 'International',
  countryName: 'Northland',

  headOffice: {
    addressLine: '12 Harbour Way, Northport Business District',
    city: 'Northport',
    region: 'Northland',
    postalCode: 'NP1 0AA',
    lat: 54.5,
    lng: 2.5,
  },
  secondSite: {
    addressLine: 'Unit 7, Eastgate Distribution Park',
    city: 'Eastgate',
    postalCode: 'EG4 2RT',
  },

  names: {
    male: [
      'Liam', 'Mateo', 'Arjun', 'Chen', 'Omar', 'Lucas', 'Kwame', 'Nikolai',
      'Hiroshi', 'Andre', 'Tomas', 'Rashid', 'Daniel', 'Felipe', 'Viktor', 'Samuel',
      'Ibrahim', 'Marco', 'Dae-jung', 'Anton',
    ],
    female: [
      'Sofia', 'Amara', 'Yuki', 'Elena', 'Priya', 'Fatima', 'Clara', 'Ngozi',
      'Mei', 'Isabela', 'Leila', 'Anna', 'Zara', 'Camille', 'Ingrid', 'Rania',
      'Nadia', 'Beatriz', 'Hana', 'Marta',
    ],
    surnames: [
      'Okafor', 'Nakamura', 'Silva', 'Kowalski', 'Rahman', 'Andersen', 'Mensah',
      'Petrov', 'Garcia', 'Dubois', 'Weber', 'Ferrari', 'Novak', 'Haddad',
      'Lindqvist', 'Moreau', 'Vargas', 'Adeyemi', 'Sharma', 'Kim', 'Bakker',
      'Costa', 'Ivanov', 'Nguyen',
    ],
  },

  areas: [
    'Harbour District', 'Old Town', 'Riverside', 'Northgate', 'Kingsway',
    'Meadowbrook', 'Foundry Quarter', 'Lakeview', 'Station Park', 'Greenfield',
  ],
  regions: [
    'Northland', 'Eastmarch', 'Westvale', 'Southshore', 'Highmoor',
    'Lakeland', 'Cranfield', 'Draymoor', 'Ashford', 'Pinehurst',
  ],
  cities: [
    { name: 'Eastgate', lat: 54.9, lng: 3.4 },
    { name: 'Westvale', lat: 53.8, lng: 1.2 },
    { name: 'Southshore', lat: 53.1, lng: 2.9 },
    { name: 'Highmoor', lat: 55.4, lng: 1.9 },
    { name: 'Lakeland', lat: 55.1, lng: 3.9 },
    { name: 'Cranfield', lat: 53.5, lng: 3.6 },
  ],

  banks: [
    { name: 'Meridian Commercial Bank', branches: ['Harbour District', 'Northgate', 'Old Town'], txn: 'ACH' },
    { name: 'Northport Savings Bank', branches: ['Kingsway', 'Riverside'], txn: 'ACH' },
    { name: 'Continental Union Bank', branches: ['Harbour District', 'Station Park'], txn: 'SWIFT' },
    { name: 'Atlas Trust Bank', branches: ['Foundry Quarter', 'Lakeview'], txn: 'SEPA' },
    { name: 'Harbourline Credit Union', branches: ['Greenfield', 'Meadowbrook'], txn: 'ACH' },
  ],
  universities: [
    'Northport University', 'Eastgate Institute of Technology', 'Westvale College',
    'Meridian Business School', 'Southshore University', 'Highmoor Polytechnic',
    'Lakeland University', 'Cranfield School of Pharmacy',
  ],
  degrees: [
    { degree: 'BSc in Computer Science', major: 'Software Engineering' },
    { degree: 'BBA', major: 'Finance' },
    { degree: 'BBA', major: 'Marketing' },
    { degree: 'MBA', major: 'Human Resource Management' },
    { degree: 'BSc in Pharmacy', major: 'Pharmaceutical Sciences' },
    { degree: 'MSc in Statistics', major: 'Applied Statistics' },
    { degree: 'BA in Communications', major: 'Corporate Communications' },
    { degree: 'BEng in Electrical Engineering', major: 'Power Systems' },
  ],
  employers: [
    'Helios Systems', 'Vantage Retail Group', 'Orbit Telecom', 'Copperline Foods',
    'Sentinel Insurance', 'Brightpath Consulting', 'Ironbridge Manufacturing',
    'Quantum Logistics', 'Everline Healthcare', 'Delta Freight Services',
    'Nimbus Software', 'Harborstone Chemicals',
  ],

  religions: [
    'Christianity', 'Christianity', 'Islam', 'Islam', 'Hinduism',
    'Buddhism', 'Judaism', 'None', 'None', 'Prefer not to say',
  ],

  customerChains: {
    prefix: [
      'Northgate', 'Riverside', 'Crown', 'Summit', 'Evergreen', 'Cornerstone',
      'Meadowbrook', 'Kingsway', 'Silverline', 'Parkview',
    ],
    suffix: [
      'Pharmacy', 'Health Centre', 'Medical Group', 'Clinic', 'Hospital',
      'Diagnostics', 'Drug Store', 'Wellness Centre',
    ],
  },

  floorLabels: ['Ground', '1st', '2nd', '3rd', '4th', '5th'],
};
