import type { DemoPack } from './types';

/** United Kingdom. Every organisation named here is invented. */
export const UNITED_KINGDOM_DEMO: DemoPack = {
  country: 'GB',

  /** Multiplier on the shared salary table — scales the baseline table into GBP. */
  salaryScale: 0.035,

  tenant: {
    name: 'Meridian Health Ltd',
    alias: 'meridian-uk',
    tagPrefix: 'MHL',
    domain: 'meridian-uk.example',
    secondName: 'Meridian Distribution Ltd',
    secondAlias: 'meridian-distribution-uk',
  },

  nationality: 'British',
  countryName: 'United Kingdom',

  headOffice: {
    addressLine: '18 Kingsway House, Albion Street',
    city: 'Manchester',
    region: 'Greater Manchester',
    postalCode: 'M1 4AE',
    lat: 53.48,
    lng: -2.24,
  },
  secondSite: {
    addressLine: 'Unit 14, Trafford Distribution Park',
    city: 'Manchester',
    postalCode: 'M17 1AB',
  },

  names: {
    male: [
      'Oliver', 'Harry', 'Jack', 'Charlie', 'Thomas', 'George', 'Oscar', 'Freddie',
      'Arthur', 'Callum', 'Dylan', 'Rhys', 'Nathan', 'Lewis', 'Connor', 'Alfie',
      'Idris', 'Kwabena', 'Ravi', 'Sean',
    ],
    female: [
      'Olivia', 'Amelia', 'Isla', 'Emily', 'Sophie', 'Grace', 'Freya', 'Charlotte',
      'Ella', 'Megan', 'Niamh', 'Aisha', 'Rhiannon', 'Beth', 'Hannah', 'Imogen',
      'Priya', 'Chloe', 'Eleanor', 'Maya',
    ],
    surnames: [
      'Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Davies', 'Evans',
      'Thomas', 'Roberts', 'Walker', 'Wright', 'Thompson', 'Robinson', 'Patel',
      'Khan', 'Murphy', 'Campbell', 'Hughes', 'Clarke', 'Bennett', 'Okonkwo',
      'Fitzgerald', 'Mackenzie',
    ],
  },

  areas: [
    'Northern Quarter', 'Ancoats', 'Deansgate', 'Salford Quays', 'Chorlton',
    'Didsbury', 'Fallowfield', 'Castlefield', 'Spinningfields', 'Prestwich',
  ],
  regions: [
    'Greater Manchester', 'Merseyside', 'West Yorkshire', 'Lancashire', 'Cheshire',
    'South Yorkshire', 'Tyne and Wear', 'West Midlands', 'Bristol', 'Edinburgh',
  ],
  cities: [
    { name: 'Liverpool', lat: 53.41, lng: -2.98 },
    { name: 'Leeds', lat: 53.8, lng: -1.55 },
    { name: 'Sheffield', lat: 53.38, lng: -1.47 },
    { name: 'Birmingham', lat: 52.49, lng: -1.89 },
    { name: 'Newcastle', lat: 54.98, lng: -1.61 },
    { name: 'Bristol', lat: 51.45, lng: -2.59 },
  ],

  banks: [
    { name: 'Northern Counties Bank', branches: ['Deansgate', 'Northern Quarter'], txn: 'BACS' },
    { name: 'Albion Building Society', branches: ['Chorlton', 'Didsbury'], txn: 'FPS' },
    { name: 'Pennine Trust Bank', branches: ['Spinningfields', 'Ancoats'], txn: 'BACS' },
    { name: 'Kingsway Commercial Bank', branches: ['Salford Quays', 'Castlefield'], txn: 'CHAPS' },
    { name: 'Mersey Mutual Bank', branches: ['Prestwich', 'Fallowfield'], txn: 'FPS' },
  ],
  universities: [
    'Pennine University', 'Albion Metropolitan University', 'Northern Institute of Technology',
    'Kingsway Business School', 'Mersey University', 'Trafford College',
    'Castlefield School of Pharmacy', 'Salford Technical Institute',
  ],
  degrees: [
    { degree: 'BSc (Hons) Computer Science', major: 'Software Engineering' },
    { degree: 'BSc (Hons) Accounting & Finance', major: 'Finance' },
    { degree: 'BA (Hons) Marketing', major: 'Marketing' },
    { degree: 'MSc Human Resource Management', major: 'HR Management' },
    { degree: 'MPharm', major: 'Pharmacy' },
    { degree: 'MSc Statistics', major: 'Applied Statistics' },
    { degree: 'BA (Hons) English', major: 'English Literature' },
    { degree: 'BEng (Hons) Electrical Engineering', major: 'Electrical Engineering' },
  ],
  employers: [
    'Pennine Systems', 'Albion Retail Group', 'Kingsway Telecom', 'Mersey Foods',
    'Sentinel Assurance', 'Clearwater Consulting', 'Ironbridge Engineering',
    'Northgate Logistics', 'Evergreen Care Services', 'Trafford Freight',
    'Beacon Software', 'Castlefield Chemicals',
  ],

  religions: [
    'Christianity', 'Christianity', 'Islam', 'Hinduism', 'Sikhism',
    'Judaism', 'None', 'None', 'None', 'Prefer not to say',
  ],

  customerChains: {
    prefix: [
      'Kingsway', 'Riverside', 'Albion', 'Pennine', 'Northgate', 'Mersey',
      'Castlefield', 'Greenbank', 'Parkview', 'Highfield',
    ],
    suffix: [
      'Pharmacy', 'Health Centre', 'Medical Practice', 'Clinic', 'Hospital',
      'Diagnostics', 'Chemist', 'Surgery',
    ],
  },

  floorLabels: ['Ground', '1st', '2nd', '3rd', '4th', '5th'],
};
