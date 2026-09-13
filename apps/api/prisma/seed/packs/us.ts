import type { DemoPack } from './types';

/** United States. Every organisation named here is invented. */
export const UNITED_STATES_DEMO: DemoPack = {
  country: 'US',

  /** Multiplier on the shared salary table — scales the baseline table into USD. */
  salaryScale: 0.05,

  tenant: {
    name: 'Meridian Health Inc.',
    alias: 'meridian-us',
    tagPrefix: 'MHI',
    domain: 'meridian-us.example',
    secondName: 'Meridian Distribution LLC',
    secondAlias: 'meridian-distribution',
  },

  nationality: 'American',
  countryName: 'United States',

  headOffice: {
    addressLine: '1200 Market Street, Suite 400',
    city: 'Philadelphia',
    region: 'Pennsylvania',
    postalCode: '19107',
    lat: 39.95,
    lng: -75.16,
  },
  secondSite: {
    addressLine: '480 Industrial Parkway',
    city: 'Allentown',
    postalCode: '18109',
  },

  names: {
    male: [
      'James', 'Michael', 'Robert', 'David', 'Carlos', 'Marcus', 'Ethan', 'Tyler',
      'Andrew', 'Jason', 'Brandon', 'Kevin', 'Miguel', 'Derek', 'Nathan', 'Christopher',
      'Aaron', 'Jordan', 'Malik', 'Ryan',
    ],
    female: [
      'Jennifer', 'Ashley', 'Maria', 'Jessica', 'Amanda', 'Danielle', 'Nicole',
      'Rachel', 'Brittany', 'Alexis', 'Kayla', 'Monica', 'Tiffany', 'Lauren',
      'Stephanie', 'Erica', 'Vanessa', 'Chelsea', 'Natalie', 'Sierra',
    ],
    surnames: [
      'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
      'Rodriguez', 'Martinez', 'Hernandez', 'Wilson', 'Anderson', 'Thomas', 'Taylor',
      'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis',
    ],
  },

  areas: [
    'Center City', 'University City', 'Fishtown', 'Northern Liberties', 'Old City',
    'Manayunk', 'Roxborough', 'Chestnut Hill', 'Society Hill', 'Bella Vista',
  ],
  regions: [
    'Pennsylvania', 'New Jersey', 'New York', 'Delaware', 'Maryland',
    'Connecticut', 'Massachusetts', 'Virginia', 'Ohio', 'North Carolina',
  ],
  cities: [
    { name: 'Allentown', lat: 40.6, lng: -75.49 },
    { name: 'Pittsburgh', lat: 40.44, lng: -79.99 },
    { name: 'Harrisburg', lat: 40.27, lng: -76.88 },
    { name: 'Wilmington', lat: 39.74, lng: -75.55 },
    { name: 'Trenton', lat: 40.22, lng: -74.76 },
    { name: 'Baltimore', lat: 39.29, lng: -76.61 },
  ],

  banks: [
    { name: 'Keystone National Bank', branches: ['Center City', 'University City'], txn: 'ACH' },
    { name: 'Liberty Federal Credit Union', branches: ['Old City', 'Fishtown'], txn: 'ACH' },
    { name: 'Commonwealth Savings Bank', branches: ['Manayunk', 'Chestnut Hill'], txn: 'ACH' },
    { name: 'Atlantic Union Trust', branches: ['Society Hill', 'Bella Vista'], txn: 'WIRE' },
    { name: 'Delaware Valley Bank', branches: ['Northern Liberties', 'Roxborough'], txn: 'ACH' },
  ],
  universities: [
    'Keystone State University', 'Delaware Valley College', 'Liberty Institute of Technology',
    'Commonwealth University', 'Northfield College', 'Allegheny Technical Institute',
    'Schuylkill Business School', 'Brandywine University',
  ],
  degrees: [
    { degree: 'BS in Computer Science', major: 'Software Engineering' },
    { degree: 'BS in Business Administration', major: 'Finance' },
    { degree: 'BA in Marketing', major: 'Marketing' },
    { degree: 'MBA', major: 'Human Resource Management' },
    { degree: 'PharmD', major: 'Pharmacy' },
    { degree: 'MS in Statistics', major: 'Data Science' },
    { degree: 'BA in Communications', major: 'Public Relations' },
    { degree: 'BS in Electrical Engineering', major: 'Electrical Engineering' },
  ],
  employers: [
    'Northfield Systems', 'Cascade Retail Group', 'Summit Telecom', 'Redwood Foods',
    'Guardian Mutual Insurance', 'Clearpath Consulting', 'Ironworks Manufacturing',
    'Pinnacle Logistics', 'Evergreen Health Partners', 'Beacon Freight',
    'Lighthouse Software', 'Granite Chemicals',
  ],

  religions: [
    'Christianity', 'Christianity', 'Christianity', 'Judaism', 'Islam',
    'Hinduism', 'None', 'None', 'Prefer not to say',
  ],

  customerChains: {
    prefix: [
      'Northfield', 'Riverside', 'Cornerstone', 'Summit', 'Evergreen', 'Brandywine',
      'Keystone', 'Lakeshore', 'Fairmount', 'Parkside',
    ],
    suffix: [
      'Pharmacy', 'Health Center', 'Medical Group', 'Clinic', 'Hospital',
      'Diagnostics', 'Drug Store', 'Family Practice',
    ],
  },

  floorLabels: ['Lobby', '2nd', '3rd', '4th', '5th', '6th'],
};
