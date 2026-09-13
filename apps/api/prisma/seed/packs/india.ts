import type { DemoPack } from './types';

/** India. Every organisation named here is invented. */
export const INDIA_DEMO: DemoPack = {
  country: 'IN',

  /** Multiplier on the shared salary table — scales the baseline table into INR. */
  salaryScale: 0.6,

  tenant: {
    name: 'Meridian Healthcare Pvt Ltd',
    alias: 'meridian-in',
    tagPrefix: 'MHP',
    domain: 'meridian-in.example',
    secondName: 'Meridian Supply Chain Pvt Ltd',
    secondAlias: 'meridian-supply-in',
  },

  nationality: 'Indian',
  countryName: 'India',

  headOffice: {
    addressLine: 'Tower B, 4th Floor, Prestige Tech Park, Outer Ring Road',
    city: 'Bengaluru',
    region: 'Karnataka',
    postalCode: '560103',
    lat: 12.93,
    lng: 77.62,
  },
  secondSite: {
    addressLine: 'Warehouse 9, Hoskote Industrial Area',
    city: 'Bengaluru',
    postalCode: '562114',
  },

  names: {
    male: [
      'Arjun', 'Rohan', 'Vikram', 'Aditya', 'Karthik', 'Rahul', 'Siddharth', 'Nikhil',
      'Pranav', 'Aravind', 'Manish', 'Sandeep', 'Harsh', 'Rajat', 'Vivek', 'Anand',
      'Deepak', 'Girish', 'Suresh', 'Imran',
    ],
    female: [
      'Priya', 'Ananya', 'Divya', 'Meera', 'Kavya', 'Sneha', 'Pooja', 'Nandini',
      'Ritika', 'Shreya', 'Aishwarya', 'Lakshmi', 'Neha', 'Swati', 'Tanvi',
      'Rukmini', 'Fatima', 'Anjali', 'Bhavna', 'Gayathri',
    ],
    surnames: [
      'Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Rao', 'Menon',
      'Gupta', 'Singh', 'Desai', 'Joshi', 'Kulkarni', 'Chatterjee', 'Banerjee',
      'Pillai', 'Shetty', 'Bhat', 'Agarwal', 'Mehta', 'Kaur', 'Das', 'Naidu', 'Khan',
    ],
  },

  areas: [
    'Koramangala', 'Indiranagar', 'Whitefield', 'HSR Layout', 'Jayanagar',
    'Malleshwaram', 'Electronic City', 'Marathahalli', 'Basavanagudi', 'Hebbal',
  ],
  regions: [
    'Karnataka', 'Tamil Nadu', 'Maharashtra', 'Telangana', 'Kerala',
    'Delhi NCR', 'West Bengal', 'Gujarat', 'Rajasthan', 'Punjab',
  ],
  cities: [
    { name: 'Chennai', lat: 13.08, lng: 80.27 },
    { name: 'Hyderabad', lat: 17.39, lng: 78.49 },
    { name: 'Mumbai', lat: 19.08, lng: 72.88 },
    { name: 'Pune', lat: 18.52, lng: 73.86 },
    { name: 'Kochi', lat: 9.93, lng: 76.27 },
    { name: 'Mysuru', lat: 12.3, lng: 76.64 },
  ],

  banks: [
    { name: 'Deccan Commercial Bank', branches: ['Koramangala', 'Indiranagar'], txn: 'NEFT' },
    { name: 'Sahyadri Co-operative Bank', branches: ['Jayanagar', 'Basavanagudi'], txn: 'IMPS' },
    { name: 'Konkan Trust Bank', branches: ['Whitefield', 'Marathahalli'], txn: 'NEFT' },
    { name: 'Nilgiri National Bank', branches: ['HSR Layout', 'Hebbal'], txn: 'RTGS' },
    { name: 'Vindhya Urban Bank', branches: ['Malleshwaram', 'Electronic City'], txn: 'UPI' },
  ],
  universities: [
    'Deccan Institute of Technology', 'Sahyadri University', 'Nilgiri College of Engineering',
    'Konkan Business School', 'Vindhya University', 'Kaveri Institute of Pharmacy',
    'Malnad Technical Institute', 'Bengaluru School of Management',
  ],
  degrees: [
    { degree: 'B.Tech', major: 'Computer Science & Engineering' },
    { degree: 'B.Com', major: 'Finance & Accounting' },
    { degree: 'BBA', major: 'Marketing' },
    { degree: 'MBA', major: 'Human Resource Management' },
    { degree: 'B.Pharm', major: 'Pharmacy' },
    { degree: 'M.Sc', major: 'Statistics' },
    { degree: 'BA', major: 'English Literature' },
    { degree: 'B.Tech', major: 'Electronics & Communication' },
  ],
  employers: [
    'Deccan Systems', 'Sahyadri Retail', 'Konkan Telecom', 'Nilgiri Foods',
    'Vindhya General Insurance', 'Kaveri Consulting', 'Malnad Engineering Works',
    'Coromandel Logistics', 'Aravalli Health Services', 'Satpura Freight',
    'Vaigai Software', 'Chambal Chemicals',
  ],

  religions: [
    'Hinduism', 'Hinduism', 'Hinduism', 'Hinduism', 'Islam', 'Islam',
    'Christianity', 'Sikhism', 'Jainism', 'Buddhism',
  ],

  customerChains: {
    prefix: [
      'Deccan', 'Sahyadri', 'Nilgiri', 'Kaveri', 'Konkan', 'Aravalli',
      'Malnad', 'Coromandel', 'Vindhya', 'Satpura',
    ],
    suffix: [
      'Medicals', 'Pharmacy', 'Medical Stores', 'Clinic', 'Hospital',
      'Diagnostics', 'Chemists', 'Health Centre',
    ],
  },

  floorLabels: ['Ground', '1st', '2nd', '3rd', '4th', '5th'],
};
