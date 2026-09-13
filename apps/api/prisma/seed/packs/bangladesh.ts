import type { DemoPack } from './types';

/**
 * Bangladesh. Banks, universities, previous employers and pharmacy chains
 * are invented — the originals named real institutions, which has no
 * place in a public repository's demo data.
 */
export const BANGLADESH_DEMO: DemoPack = {
  country: 'BD',

  /** Multiplier on the shared salary table — the baseline the table was written in. */
  salaryScale: 1,

  tenant: {
    name: 'Shurjo Pharma Ltd',
    alias: 'shurjo',
    tagPrefix: 'SPL',
    domain: 'shurjo.example',
    secondName: 'Shurjo Logistics Ltd',
    secondAlias: 'shurjo-logistics',
  },

  nationality: 'Bangladeshi',
  countryName: 'Bangladesh',

  headOffice: {
    addressLine: 'House 42, Road 11, Banani',
    city: 'Dhaka',
    region: 'Dhaka',
    postalCode: '1213',
    lat: 23.72,
    lng: 90.4,
  },
  secondSite: {
    addressLine: 'Plot 7, Tejgaon Industrial Area',
    city: 'Dhaka',
    postalCode: '1208',
  },

  names: {
    male: [
      'Nazmul', 'Tanvir', 'Rakib', 'Sajjad', 'Imran', 'Mahfuz', 'Shahriar', 'Arif',
      'Farhan', 'Rashed', 'Sabbir', 'Zahid', 'Ashiqur', 'Mizanur', 'Kamrul', 'Rifat',
      'Naimul', 'Tahmid', 'Sazid', 'Mehedi', 'Asif', 'Rezaul', 'Shakib', 'Anisur',
      'Jubayer', 'Redwan', 'Towhid', 'Golam', 'Masud', 'Sohel', 'Ariful', 'Nurul',
    ],
    female: [
      'Nusrat', 'Tahmina', 'Sadia', 'Farzana', 'Rumana', 'Sabrina', 'Ishrat', 'Maliha',
      'Nabila', 'Sumaiya', 'Tasnim', 'Afsana', 'Jannatul', 'Mahmuda', 'Shireen', 'Rubaiya',
      'Anika', 'Samira', 'Fahmida', 'Noshin', 'Raisa', 'Sharmin', 'Tania', 'Lubna',
    ],
    surnames: [
      'Hossain', 'Rahman', 'Islam', 'Ahmed', 'Chowdhury', 'Karim', 'Akter', 'Khatun',
      'Uddin', 'Alam', 'Haque', 'Sarker', 'Mia', 'Bhuiyan', 'Talukder', 'Molla',
      'Siddique', 'Mahmud', 'Kabir', 'Hasan', 'Jahan', 'Sultana', 'Begum', 'Mondal',
      'Barua', 'Das', 'Roy', 'Saha', 'Dutta', 'Ghosh',
    ],
  },

  areas: [
    'Banani', 'Gulshan', 'Dhanmondi', 'Uttara', 'Mirpur', 'Mohammadpur',
    'Bashundhara R/A', 'Badda', 'Rampura', 'Motijheel', 'Tejgaon', 'Khilgaon',
    'Shyamoli', 'Malibagh',
  ],
  regions: [
    'Dhaka', 'Chattogram', 'Sylhet', 'Rajshahi', 'Khulna', 'Barishal', 'Rangpur',
    'Mymensingh', 'Cumilla', 'Narayanganj', 'Gazipur', 'Bogura', 'Jashore', 'Noakhali',
  ],
  cities: [
    { name: 'Chattogram', lat: 22.35, lng: 91.82 },
    { name: 'Sylhet', lat: 24.9, lng: 91.87 },
    { name: 'Rajshahi', lat: 24.37, lng: 88.6 },
    { name: 'Khulna', lat: 22.81, lng: 89.56 },
    { name: 'Barishal', lat: 22.7, lng: 90.37 },
    { name: 'Rangpur', lat: 25.75, lng: 89.24 },
    { name: 'Mymensingh', lat: 24.75, lng: 90.4 },
  ],

  banks: [
    { name: 'Padma Commercial Bank PLC', branches: ['Gulshan', 'Banani', 'Motijheel'], txn: 'BEFTN' },
    { name: 'Jamuna Trust Bank PLC', branches: ['Gulshan', 'Uttara', 'Dhanmondi'], txn: 'BEFTN' },
    { name: 'Meghna City Bank PLC', branches: ['Gulshan Avenue', 'Mirpur'], txn: 'BEFTN' },
    { name: 'Shurjomukhi Bank PLC', branches: ['Banani', 'Motijheel'], txn: 'RTGS' },
    { name: 'Bengal Islami Bank PLC', branches: ['Dilkusha', 'Uttara'], txn: 'BEFTN' },
  ],
  universities: [
    'Padma University', 'Bengal Institute of Engineering & Technology',
    'Northern Metropolitan University', 'Jamuna University', 'Meghna University',
    'Chattogram Institute of Technology', 'Shurjo University of Science & Technology',
    'Delta Business School',
  ],
  degrees: [
    { degree: 'BSc in Computer Science & Engineering', major: 'CSE' },
    { degree: 'BBA', major: 'Finance' },
    { degree: 'BBA', major: 'Marketing' },
    { degree: 'MBA', major: 'Human Resource Management' },
    { degree: 'BSc in Pharmacy', major: 'Pharmacy' },
    { degree: 'MSc in Statistics', major: 'Statistics' },
    { degree: 'BA in English', major: 'English Literature' },
    { degree: 'BSc in Electrical & Electronic Engineering', major: 'EEE' },
  ],
  employers: [
    'Bengal Telecom Ltd', 'Nagorik Digital Finance', 'Delta Pharmaceuticals',
    'Padma Consumer Goods', 'Shomoy Logistics', 'Onnesha Software',
    'Aurora Health Services', 'Kotha Mobility', 'Bipani Commerce',
    'Shetu Engineering', 'Uttoron Textiles', 'Protyasha Foods',
  ],

  religions: ['Islam', 'Islam', 'Islam', 'Islam', 'Hinduism', 'Buddhism', 'Christianity'],

  customerChains: {
    prefix: [
      'Nobo', 'Tamanna', 'Shohag', 'Al-Amin', 'Jonopriyo', 'Dipti', 'Arogya',
      'Shefa', 'Bhalo', 'Nirapod',
    ],
    suffix: [
      'Pharma', 'Pharmacy', 'Medicine Corner', 'Drug House', 'Medical Hall',
      'Diagnostics', 'Hospital', 'Clinic',
    ],
  },

  floorLabels: ['Ground', '2nd', '3rd', '5th', '7th', '9th'],
};
