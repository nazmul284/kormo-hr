import type { DemoPack } from './types';

/** United Arab Emirates. Every organisation named here is invented. */
export const UNITED_ARAB_EMIRATES_DEMO: DemoPack = {
  country: 'AE',

  /** Multiplier on the shared salary table — scales the baseline table into AED. */
  salaryScale: 0.15,

  tenant: {
    name: 'Meridian Health LLC',
    alias: 'meridian-ae',
    tagPrefix: 'MHA',
    domain: 'meridian-ae.example',
    secondName: 'Meridian Logistics FZE',
    secondAlias: 'meridian-logistics-ae',
  },

  nationality: 'Emirati',
  countryName: 'United Arab Emirates',

  headOffice: {
    addressLine: 'Office 1204, Al Manara Tower, Business Bay',
    city: 'Dubai',
    region: 'Dubai',
    postalCode: '00000',
    lat: 25.19,
    lng: 55.27,
  },
  secondSite: {
    addressLine: 'Warehouse 22, Jebel Ali Free Zone South',
    city: 'Dubai',
    postalCode: '00000',
  },

  names: {
    male: [
      'Mohammed', 'Ahmed', 'Khalid', 'Omar', 'Yousef', 'Saeed', 'Hamdan', 'Faisal',
      'Tariq', 'Rashid', 'Sultan', 'Nasser', 'Zayed', 'Majid', 'Hassan', 'Bilal',
      'Karim', 'Adnan', 'Waleed', 'Ibrahim',
    ],
    female: [
      'Fatima', 'Aisha', 'Mariam', 'Noura', 'Sara', 'Layla', 'Hessa', 'Amna',
      'Shaikha', 'Reem', 'Alia', 'Hind', 'Maitha', 'Salama', 'Dana', 'Yasmin',
      'Rania', 'Huda', 'Zahra', 'Maha',
    ],
    surnames: [
      'Al Mansouri', 'Al Suwaidi', 'Al Hashimi', 'Al Marri', 'Al Zaabi', 'Al Nuaimi',
      'Al Shamsi', 'Al Balushi', 'Haddad', 'Khoury', 'Nasser', 'Farouk', 'Siddiqui',
      'Rahman', 'Iqbal', 'Abdallah', 'Mahmoud', 'Saleh', 'Youssef', 'Darwish',
    ],
  },

  areas: [
    'Business Bay', 'Downtown', 'Al Barsha', 'Jumeirah', 'Deira', 'Bur Dubai',
    'Dubai Marina', 'Al Quoz', 'Mirdif', 'Silicon Oasis',
  ],
  regions: [
    'Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah',
    'Fujairah', 'Umm Al Quwain', 'Al Ain', 'Khor Fakkan', 'Dibba',
  ],
  cities: [
    { name: 'Abu Dhabi', lat: 24.45, lng: 54.38 },
    { name: 'Sharjah', lat: 25.35, lng: 55.4 },
    { name: 'Ajman', lat: 25.4, lng: 55.48 },
    { name: 'Ras Al Khaimah', lat: 25.79, lng: 55.94 },
    { name: 'Fujairah', lat: 25.13, lng: 56.34 },
    { name: 'Al Ain', lat: 24.21, lng: 55.74 },
  ],

  banks: [
    { name: 'Gulf Meridian Bank', branches: ['Business Bay', 'Downtown'], txn: 'WPS' },
    { name: 'Arabian Commercial Bank', branches: ['Deira', 'Bur Dubai'], txn: 'WPS' },
    { name: 'Emirates Union Bank', branches: ['Dubai Marina', 'Al Barsha'], txn: 'IBAN' },
    { name: 'Falcon Islamic Bank', branches: ['Jumeirah', 'Mirdif'], txn: 'WPS' },
    { name: 'Oasis Trust Bank', branches: ['Silicon Oasis', 'Al Quoz'], txn: 'SWIFT' },
  ],
  universities: [
    'Gulf Institute of Technology', 'Arabian University', 'Falcon Business School',
    'Oasis University of Science', 'Emirates Technical College',
    'Al Manara Institute of Pharmacy', 'Khaleej Management School', 'Desert Rose University',
  ],
  degrees: [
    { degree: 'BSc in Computer Science', major: 'Software Engineering' },
    { degree: 'BBA', major: 'Finance' },
    { degree: 'BBA', major: 'Marketing' },
    { degree: 'MBA', major: 'Human Resource Management' },
    { degree: 'BPharm', major: 'Pharmacy' },
    { degree: 'MSc in Statistics', major: 'Data Analytics' },
    { degree: 'BA in Media & Communications', major: 'Communications' },
    { degree: 'BEng in Electrical Engineering', major: 'Electrical Engineering' },
  ],
  employers: [
    'Khaleej Systems', 'Falcon Retail Group', 'Oasis Telecom', 'Desert Rose Foods',
    'Gulf Shield Insurance', 'Al Manara Consulting', 'Sandstone Engineering',
    'Dune Logistics', 'Arabian Health Partners', 'Marina Freight',
    'Pearl Software', 'Horizon Chemicals',
  ],

  religions: [
    'Islam', 'Islam', 'Islam', 'Islam', 'Islam', 'Islam',
    'Christianity', 'Hinduism', 'Buddhism', 'Prefer not to say',
  ],

  customerChains: {
    prefix: [
      'Al Manara', 'Gulf', 'Oasis', 'Falcon', 'Marina', 'Khaleej',
      'Pearl', 'Desert Rose', 'Horizon', 'Sandstone',
    ],
    suffix: [
      'Pharmacy', 'Medical Centre', 'Health Group', 'Clinic', 'Hospital',
      'Diagnostics', 'Drug Store', 'Polyclinic',
    ],
  },

  floorLabels: ['Ground', 'Mezzanine', '3rd', '7th', '12th', '18th'],
};
