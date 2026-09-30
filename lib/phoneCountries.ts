/** 電話番号入力の国番号マスタ（デフォルトは Japan / +81） */

export type PhoneCountry = {
  iso2: string;
  /** 英語表記（UI 表示用） */
  nameEn: string;
  dialCode: string;
  /** 国内番号の想定桁数（バリデーション目安） */
  expectedDigits: number;
  minDigits: number;
  maxDigits: number;
  /**
   * ハイフン整形パターン（各グループの桁数）。
   * 例: 日本携帯 [3,4,4] → 090-1234-5678
   */
  groups: number[];
};

type CountrySeed = {
  iso2: string;
  nameEn: string;
  dialCode: string;
  expectedDigits?: number;
  minDigits?: number;
  maxDigits?: number;
  groups?: number[];
};

function defineCountry(seed: CountrySeed): PhoneCountry {
  const expected = seed.expectedDigits ?? 10;
  return {
    iso2: seed.iso2,
    nameEn: seed.nameEn,
    dialCode: seed.dialCode,
    expectedDigits: expected,
    minDigits: seed.minDigits ?? Math.max(6, expected - 2),
    maxDigits: seed.maxDigits ?? Math.min(15, expected + 2),
    groups: seed.groups ?? [3, 3, 4],
  };
}

/** よく使う国（先頭に固定） */
const PRIORITY_ISO2 = [
  'JP',
  'US',
  'KR',
  'TW',
  'CN',
  'GB',
  'AU',
  'SG',
  'TH',
  'VN',
  'PH',
  'IN',
  'DE',
  'FR',
  'CA',
  'HK',
  'MY',
  'ID',
] as const;

/**
 * 主要国を含む包括リスト（英語名・国際ダイヤルコード）。
 * 桁数は一般的な携帯/国内番号の目安。厳密な番号計画までは保証しない。
 */
const COUNTRY_SEEDS: CountrySeed[] = [
  { iso2: 'AF', nameEn: 'Afghanistan', dialCode: '93', expectedDigits: 9 },
  { iso2: 'AL', nameEn: 'Albania', dialCode: '355', expectedDigits: 9 },
  { iso2: 'DZ', nameEn: 'Algeria', dialCode: '213', expectedDigits: 9 },
  { iso2: 'AD', nameEn: 'Andorra', dialCode: '376', expectedDigits: 6, minDigits: 6, maxDigits: 9 },
  { iso2: 'AO', nameEn: 'Angola', dialCode: '244', expectedDigits: 9 },
  { iso2: 'AG', nameEn: 'Antigua and Barbuda', dialCode: '1', expectedDigits: 10, minDigits: 10, maxDigits: 10 },
  { iso2: 'AR', nameEn: 'Argentina', dialCode: '54', expectedDigits: 10, minDigits: 10, maxDigits: 11 },
  { iso2: 'AM', nameEn: 'Armenia', dialCode: '374', expectedDigits: 8 },
  { iso2: 'AW', nameEn: 'Aruba', dialCode: '297', expectedDigits: 7, minDigits: 7, maxDigits: 7 },
  { iso2: 'AU', nameEn: 'Australia', dialCode: '61', expectedDigits: 9, minDigits: 9, maxDigits: 9, groups: [3, 3, 3] },
  { iso2: 'AT', nameEn: 'Austria', dialCode: '43', expectedDigits: 10, minDigits: 9, maxDigits: 13 },
  { iso2: 'AZ', nameEn: 'Azerbaijan', dialCode: '994', expectedDigits: 9 },
  { iso2: 'BS', nameEn: 'Bahamas', dialCode: '1', expectedDigits: 10, minDigits: 10, maxDigits: 10 },
  { iso2: 'BH', nameEn: 'Bahrain', dialCode: '973', expectedDigits: 8, minDigits: 8, maxDigits: 8 },
  { iso2: 'BD', nameEn: 'Bangladesh', dialCode: '880', expectedDigits: 10 },
  { iso2: 'BB', nameEn: 'Barbados', dialCode: '1', expectedDigits: 10, minDigits: 10, maxDigits: 10 },
  { iso2: 'BY', nameEn: 'Belarus', dialCode: '375', expectedDigits: 9 },
  { iso2: 'BE', nameEn: 'Belgium', dialCode: '32', expectedDigits: 9, minDigits: 8, maxDigits: 9 },
  { iso2: 'BZ', nameEn: 'Belize', dialCode: '501', expectedDigits: 7, minDigits: 7, maxDigits: 7 },
  { iso2: 'BJ', nameEn: 'Benin', dialCode: '229', expectedDigits: 8 },
  { iso2: 'BT', nameEn: 'Bhutan', dialCode: '975', expectedDigits: 8 },
  { iso2: 'BO', nameEn: 'Bolivia', dialCode: '591', expectedDigits: 8 },
  { iso2: 'BA', nameEn: 'Bosnia and Herzegovina', dialCode: '387', expectedDigits: 8 },
  { iso2: 'BW', nameEn: 'Botswana', dialCode: '267', expectedDigits: 8 },
  { iso2: 'BR', nameEn: 'Brazil', dialCode: '55', expectedDigits: 11, minDigits: 10, maxDigits: 11, groups: [2, 5, 4] },
  { iso2: 'BN', nameEn: 'Brunei', dialCode: '673', expectedDigits: 7 },
  { iso2: 'BG', nameEn: 'Bulgaria', dialCode: '359', expectedDigits: 9 },
  { iso2: 'BF', nameEn: 'Burkina Faso', dialCode: '226', expectedDigits: 8 },
  { iso2: 'BI', nameEn: 'Burundi', dialCode: '257', expectedDigits: 8 },
  { iso2: 'KH', nameEn: 'Cambodia', dialCode: '855', expectedDigits: 9 },
  { iso2: 'CM', nameEn: 'Cameroon', dialCode: '237', expectedDigits: 9 },
  { iso2: 'CA', nameEn: 'Canada', dialCode: '1', expectedDigits: 10, minDigits: 10, maxDigits: 10, groups: [3, 3, 4] },
  { iso2: 'CV', nameEn: 'Cape Verde', dialCode: '238', expectedDigits: 7 },
  { iso2: 'KY', nameEn: 'Cayman Islands', dialCode: '1', expectedDigits: 10, minDigits: 10, maxDigits: 10 },
  { iso2: 'CF', nameEn: 'Central African Republic', dialCode: '236', expectedDigits: 8 },
  { iso2: 'TD', nameEn: 'Chad', dialCode: '235', expectedDigits: 8 },
  { iso2: 'CL', nameEn: 'Chile', dialCode: '56', expectedDigits: 9 },
  { iso2: 'CN', nameEn: 'China', dialCode: '86', expectedDigits: 11, minDigits: 11, maxDigits: 11, groups: [3, 4, 4] },
  { iso2: 'CO', nameEn: 'Colombia', dialCode: '57', expectedDigits: 10 },
  { iso2: 'KM', nameEn: 'Comoros', dialCode: '269', expectedDigits: 7 },
  { iso2: 'CG', nameEn: 'Congo', dialCode: '242', expectedDigits: 9 },
  { iso2: 'CD', nameEn: 'Congo (DRC)', dialCode: '243', expectedDigits: 9 },
  { iso2: 'CR', nameEn: 'Costa Rica', dialCode: '506', expectedDigits: 8 },
  { iso2: 'HR', nameEn: 'Croatia', dialCode: '385', expectedDigits: 9 },
  { iso2: 'CU', nameEn: 'Cuba', dialCode: '53', expectedDigits: 8 },
  { iso2: 'CY', nameEn: 'Cyprus', dialCode: '357', expectedDigits: 8 },
  { iso2: 'CZ', nameEn: 'Czech Republic', dialCode: '420', expectedDigits: 9 },
  { iso2: 'DK', nameEn: 'Denmark', dialCode: '45', expectedDigits: 8, minDigits: 8, maxDigits: 8 },
  { iso2: 'DJ', nameEn: 'Djibouti', dialCode: '253', expectedDigits: 8 },
  { iso2: 'DM', nameEn: 'Dominica', dialCode: '1', expectedDigits: 10, minDigits: 10, maxDigits: 10 },
  { iso2: 'DO', nameEn: 'Dominican Republic', dialCode: '1', expectedDigits: 10, minDigits: 10, maxDigits: 10 },
  { iso2: 'EC', nameEn: 'Ecuador', dialCode: '593', expectedDigits: 9 },
  { iso2: 'EG', nameEn: 'Egypt', dialCode: '20', expectedDigits: 10 },
  { iso2: 'SV', nameEn: 'El Salvador', dialCode: '503', expectedDigits: 8 },
  { iso2: 'GQ', nameEn: 'Equatorial Guinea', dialCode: '240', expectedDigits: 9 },
  { iso2: 'ER', nameEn: 'Eritrea', dialCode: '291', expectedDigits: 7 },
  { iso2: 'EE', nameEn: 'Estonia', dialCode: '372', expectedDigits: 8 },
  { iso2: 'SZ', nameEn: 'Eswatini', dialCode: '268', expectedDigits: 8 },
  { iso2: 'ET', nameEn: 'Ethiopia', dialCode: '251', expectedDigits: 9 },
  { iso2: 'FJ', nameEn: 'Fiji', dialCode: '679', expectedDigits: 7 },
  { iso2: 'FI', nameEn: 'Finland', dialCode: '358', expectedDigits: 9, minDigits: 7, maxDigits: 12 },
  { iso2: 'FR', nameEn: 'France', dialCode: '33', expectedDigits: 9, minDigits: 9, maxDigits: 9, groups: [1, 2, 2, 2, 2] },
  { iso2: 'GA', nameEn: 'Gabon', dialCode: '241', expectedDigits: 8 },
  { iso2: 'GM', nameEn: 'Gambia', dialCode: '220', expectedDigits: 7 },
  { iso2: 'GE', nameEn: 'Georgia', dialCode: '995', expectedDigits: 9 },
  { iso2: 'DE', nameEn: 'Germany', dialCode: '49', expectedDigits: 11, minDigits: 10, maxDigits: 13, groups: [3, 4, 4] },
  { iso2: 'GH', nameEn: 'Ghana', dialCode: '233', expectedDigits: 9 },
  { iso2: 'GR', nameEn: 'Greece', dialCode: '30', expectedDigits: 10 },
  { iso2: 'GD', nameEn: 'Grenada', dialCode: '1', expectedDigits: 10, minDigits: 10, maxDigits: 10 },
  { iso2: 'GT', nameEn: 'Guatemala', dialCode: '502', expectedDigits: 8 },
  { iso2: 'GN', nameEn: 'Guinea', dialCode: '224', expectedDigits: 9 },
  { iso2: 'GW', nameEn: 'Guinea-Bissau', dialCode: '245', expectedDigits: 7 },
  { iso2: 'GY', nameEn: 'Guyana', dialCode: '592', expectedDigits: 7 },
  { iso2: 'HT', nameEn: 'Haiti', dialCode: '509', expectedDigits: 8 },
  { iso2: 'HN', nameEn: 'Honduras', dialCode: '504', expectedDigits: 8 },
  { iso2: 'HK', nameEn: 'Hong Kong', dialCode: '852', expectedDigits: 8, minDigits: 8, maxDigits: 8, groups: [4, 4] },
  { iso2: 'HU', nameEn: 'Hungary', dialCode: '36', expectedDigits: 9 },
  { iso2: 'IS', nameEn: 'Iceland', dialCode: '354', expectedDigits: 7 },
  { iso2: 'IN', nameEn: 'India', dialCode: '91', expectedDigits: 10, minDigits: 10, maxDigits: 10, groups: [5, 5] },
  { iso2: 'ID', nameEn: 'Indonesia', dialCode: '62', expectedDigits: 11, minDigits: 9, maxDigits: 12, groups: [3, 4, 4] },
  { iso2: 'IR', nameEn: 'Iran', dialCode: '98', expectedDigits: 10 },
  { iso2: 'IQ', nameEn: 'Iraq', dialCode: '964', expectedDigits: 10 },
  { iso2: 'IE', nameEn: 'Ireland', dialCode: '353', expectedDigits: 9 },
  { iso2: 'IL', nameEn: 'Israel', dialCode: '972', expectedDigits: 9 },
  { iso2: 'IT', nameEn: 'Italy', dialCode: '39', expectedDigits: 10, minDigits: 9, maxDigits: 11 },
  { iso2: 'CI', nameEn: 'Ivory Coast', dialCode: '225', expectedDigits: 10 },
  { iso2: 'JM', nameEn: 'Jamaica', dialCode: '1', expectedDigits: 10, minDigits: 10, maxDigits: 10 },
  {
    iso2: 'JP',
    nameEn: 'Japan',
    dialCode: '81',
    expectedDigits: 11,
    minDigits: 10,
    maxDigits: 11,
    groups: [3, 4, 4],
  },
  { iso2: 'JO', nameEn: 'Jordan', dialCode: '962', expectedDigits: 9 },
  { iso2: 'KZ', nameEn: 'Kazakhstan', dialCode: '7', expectedDigits: 10 },
  { iso2: 'KE', nameEn: 'Kenya', dialCode: '254', expectedDigits: 9 },
  { iso2: 'KI', nameEn: 'Kiribati', dialCode: '686', expectedDigits: 8 },
  { iso2: 'KW', nameEn: 'Kuwait', dialCode: '965', expectedDigits: 8 },
  { iso2: 'KG', nameEn: 'Kyrgyzstan', dialCode: '996', expectedDigits: 9 },
  { iso2: 'LA', nameEn: 'Laos', dialCode: '856', expectedDigits: 10 },
  { iso2: 'LV', nameEn: 'Latvia', dialCode: '371', expectedDigits: 8 },
  { iso2: 'LB', nameEn: 'Lebanon', dialCode: '961', expectedDigits: 8 },
  { iso2: 'LS', nameEn: 'Lesotho', dialCode: '266', expectedDigits: 8 },
  { iso2: 'LR', nameEn: 'Liberia', dialCode: '231', expectedDigits: 8 },
  { iso2: 'LY', nameEn: 'Libya', dialCode: '218', expectedDigits: 9 },
  { iso2: 'LI', nameEn: 'Liechtenstein', dialCode: '423', expectedDigits: 7 },
  { iso2: 'LT', nameEn: 'Lithuania', dialCode: '370', expectedDigits: 8 },
  { iso2: 'LU', nameEn: 'Luxembourg', dialCode: '352', expectedDigits: 9 },
  { iso2: 'MO', nameEn: 'Macao', dialCode: '853', expectedDigits: 8 },
  { iso2: 'MG', nameEn: 'Madagascar', dialCode: '261', expectedDigits: 9 },
  { iso2: 'MW', nameEn: 'Malawi', dialCode: '265', expectedDigits: 9 },
  { iso2: 'MY', nameEn: 'Malaysia', dialCode: '60', expectedDigits: 9, minDigits: 9, maxDigits: 10, groups: [2, 4, 4] },
  { iso2: 'MV', nameEn: 'Maldives', dialCode: '960', expectedDigits: 7 },
  { iso2: 'ML', nameEn: 'Mali', dialCode: '223', expectedDigits: 8 },
  { iso2: 'MT', nameEn: 'Malta', dialCode: '356', expectedDigits: 8 },
  { iso2: 'MH', nameEn: 'Marshall Islands', dialCode: '692', expectedDigits: 7 },
  { iso2: 'MR', nameEn: 'Mauritania', dialCode: '222', expectedDigits: 8 },
  { iso2: 'MU', nameEn: 'Mauritius', dialCode: '230', expectedDigits: 8 },
  { iso2: 'MX', nameEn: 'Mexico', dialCode: '52', expectedDigits: 10, minDigits: 10, maxDigits: 10 },
  { iso2: 'FM', nameEn: 'Micronesia', dialCode: '691', expectedDigits: 7 },
  { iso2: 'MD', nameEn: 'Moldova', dialCode: '373', expectedDigits: 8 },
  { iso2: 'MC', nameEn: 'Monaco', dialCode: '377', expectedDigits: 8 },
  { iso2: 'MN', nameEn: 'Mongolia', dialCode: '976', expectedDigits: 8 },
  { iso2: 'ME', nameEn: 'Montenegro', dialCode: '382', expectedDigits: 8 },
  { iso2: 'MA', nameEn: 'Morocco', dialCode: '212', expectedDigits: 9 },
  { iso2: 'MZ', nameEn: 'Mozambique', dialCode: '258', expectedDigits: 9 },
  { iso2: 'MM', nameEn: 'Myanmar', dialCode: '95', expectedDigits: 9 },
  { iso2: 'NA', nameEn: 'Namibia', dialCode: '264', expectedDigits: 9 },
  { iso2: 'NR', nameEn: 'Nauru', dialCode: '674', expectedDigits: 7 },
  { iso2: 'NP', nameEn: 'Nepal', dialCode: '977', expectedDigits: 10 },
  { iso2: 'NL', nameEn: 'Netherlands', dialCode: '31', expectedDigits: 9 },
  { iso2: 'NZ', nameEn: 'New Zealand', dialCode: '64', expectedDigits: 9, minDigits: 8, maxDigits: 10 },
  { iso2: 'NI', nameEn: 'Nicaragua', dialCode: '505', expectedDigits: 8 },
  { iso2: 'NE', nameEn: 'Niger', dialCode: '227', expectedDigits: 8 },
  { iso2: 'NG', nameEn: 'Nigeria', dialCode: '234', expectedDigits: 10 },
  { iso2: 'KP', nameEn: 'North Korea', dialCode: '850', expectedDigits: 10 },
  { iso2: 'MK', nameEn: 'North Macedonia', dialCode: '389', expectedDigits: 8 },
  { iso2: 'NO', nameEn: 'Norway', dialCode: '47', expectedDigits: 8, minDigits: 8, maxDigits: 8 },
  { iso2: 'OM', nameEn: 'Oman', dialCode: '968', expectedDigits: 8 },
  { iso2: 'PK', nameEn: 'Pakistan', dialCode: '92', expectedDigits: 10 },
  { iso2: 'PW', nameEn: 'Palau', dialCode: '680', expectedDigits: 7 },
  { iso2: 'PS', nameEn: 'Palestine', dialCode: '970', expectedDigits: 9 },
  { iso2: 'PA', nameEn: 'Panama', dialCode: '507', expectedDigits: 8 },
  { iso2: 'PG', nameEn: 'Papua New Guinea', dialCode: '675', expectedDigits: 8 },
  { iso2: 'PY', nameEn: 'Paraguay', dialCode: '595', expectedDigits: 9 },
  { iso2: 'PE', nameEn: 'Peru', dialCode: '51', expectedDigits: 9 },
  { iso2: 'PH', nameEn: 'Philippines', dialCode: '63', expectedDigits: 10, minDigits: 10, maxDigits: 10, groups: [3, 3, 4] },
  { iso2: 'PL', nameEn: 'Poland', dialCode: '48', expectedDigits: 9 },
  { iso2: 'PT', nameEn: 'Portugal', dialCode: '351', expectedDigits: 9 },
  { iso2: 'PR', nameEn: 'Puerto Rico', dialCode: '1', expectedDigits: 10, minDigits: 10, maxDigits: 10 },
  { iso2: 'QA', nameEn: 'Qatar', dialCode: '974', expectedDigits: 8 },
  { iso2: 'RO', nameEn: 'Romania', dialCode: '40', expectedDigits: 9 },
  { iso2: 'RU', nameEn: 'Russia', dialCode: '7', expectedDigits: 10, minDigits: 10, maxDigits: 10 },
  { iso2: 'RW', nameEn: 'Rwanda', dialCode: '250', expectedDigits: 9 },
  { iso2: 'KN', nameEn: 'Saint Kitts and Nevis', dialCode: '1', expectedDigits: 10, minDigits: 10, maxDigits: 10 },
  { iso2: 'LC', nameEn: 'Saint Lucia', dialCode: '1', expectedDigits: 10, minDigits: 10, maxDigits: 10 },
  { iso2: 'VC', nameEn: 'Saint Vincent and the Grenadines', dialCode: '1', expectedDigits: 10, minDigits: 10, maxDigits: 10 },
  { iso2: 'WS', nameEn: 'Samoa', dialCode: '685', expectedDigits: 7 },
  { iso2: 'SM', nameEn: 'San Marino', dialCode: '378', expectedDigits: 10 },
  { iso2: 'ST', nameEn: 'Sao Tome and Principe', dialCode: '239', expectedDigits: 7 },
  { iso2: 'SA', nameEn: 'Saudi Arabia', dialCode: '966', expectedDigits: 9 },
  { iso2: 'SN', nameEn: 'Senegal', dialCode: '221', expectedDigits: 9 },
  { iso2: 'RS', nameEn: 'Serbia', dialCode: '381', expectedDigits: 9 },
  { iso2: 'SC', nameEn: 'Seychelles', dialCode: '248', expectedDigits: 7 },
  { iso2: 'SL', nameEn: 'Sierra Leone', dialCode: '232', expectedDigits: 8 },
  { iso2: 'SG', nameEn: 'Singapore', dialCode: '65', expectedDigits: 8, minDigits: 8, maxDigits: 8, groups: [4, 4] },
  { iso2: 'SK', nameEn: 'Slovakia', dialCode: '421', expectedDigits: 9 },
  { iso2: 'SI', nameEn: 'Slovenia', dialCode: '386', expectedDigits: 8 },
  { iso2: 'SB', nameEn: 'Solomon Islands', dialCode: '677', expectedDigits: 7 },
  { iso2: 'SO', nameEn: 'Somalia', dialCode: '252', expectedDigits: 8 },
  { iso2: 'ZA', nameEn: 'South Africa', dialCode: '27', expectedDigits: 9 },
  { iso2: 'KR', nameEn: 'South Korea', dialCode: '82', expectedDigits: 10, minDigits: 9, maxDigits: 11, groups: [3, 4, 4] },
  { iso2: 'SS', nameEn: 'South Sudan', dialCode: '211', expectedDigits: 9 },
  { iso2: 'ES', nameEn: 'Spain', dialCode: '34', expectedDigits: 9, minDigits: 9, maxDigits: 9 },
  { iso2: 'LK', nameEn: 'Sri Lanka', dialCode: '94', expectedDigits: 9 },
  { iso2: 'SD', nameEn: 'Sudan', dialCode: '249', expectedDigits: 9 },
  { iso2: 'SR', nameEn: 'Suriname', dialCode: '597', expectedDigits: 7 },
  { iso2: 'SE', nameEn: 'Sweden', dialCode: '46', expectedDigits: 9 },
  { iso2: 'CH', nameEn: 'Switzerland', dialCode: '41', expectedDigits: 9 },
  { iso2: 'SY', nameEn: 'Syria', dialCode: '963', expectedDigits: 9 },
  { iso2: 'TW', nameEn: 'Taiwan', dialCode: '886', expectedDigits: 9, minDigits: 8, maxDigits: 10, groups: [3, 3, 3] },
  { iso2: 'TJ', nameEn: 'Tajikistan', dialCode: '992', expectedDigits: 9 },
  { iso2: 'TZ', nameEn: 'Tanzania', dialCode: '255', expectedDigits: 9 },
  { iso2: 'TH', nameEn: 'Thailand', dialCode: '66', expectedDigits: 9, minDigits: 8, maxDigits: 9, groups: [2, 3, 4] },
  { iso2: 'TL', nameEn: 'Timor-Leste', dialCode: '670', expectedDigits: 8 },
  { iso2: 'TG', nameEn: 'Togo', dialCode: '228', expectedDigits: 8 },
  { iso2: 'TO', nameEn: 'Tonga', dialCode: '676', expectedDigits: 7 },
  { iso2: 'TT', nameEn: 'Trinidad and Tobago', dialCode: '1', expectedDigits: 10, minDigits: 10, maxDigits: 10 },
  { iso2: 'TN', nameEn: 'Tunisia', dialCode: '216', expectedDigits: 8 },
  { iso2: 'TR', nameEn: 'Turkey', dialCode: '90', expectedDigits: 10 },
  { iso2: 'TM', nameEn: 'Turkmenistan', dialCode: '993', expectedDigits: 8 },
  { iso2: 'TV', nameEn: 'Tuvalu', dialCode: '688', expectedDigits: 6, minDigits: 5, maxDigits: 7 },
  { iso2: 'UG', nameEn: 'Uganda', dialCode: '256', expectedDigits: 9 },
  { iso2: 'UA', nameEn: 'Ukraine', dialCode: '380', expectedDigits: 9 },
  { iso2: 'AE', nameEn: 'United Arab Emirates', dialCode: '971', expectedDigits: 9 },
  { iso2: 'GB', nameEn: 'United Kingdom', dialCode: '44', expectedDigits: 10, minDigits: 9, maxDigits: 10, groups: [4, 3, 3] },
  { iso2: 'US', nameEn: 'United States', dialCode: '1', expectedDigits: 10, minDigits: 10, maxDigits: 10, groups: [3, 3, 4] },
  { iso2: 'UY', nameEn: 'Uruguay', dialCode: '598', expectedDigits: 8 },
  { iso2: 'UZ', nameEn: 'Uzbekistan', dialCode: '998', expectedDigits: 9 },
  { iso2: 'VU', nameEn: 'Vanuatu', dialCode: '678', expectedDigits: 7 },
  { iso2: 'VA', nameEn: 'Vatican City', dialCode: '39', expectedDigits: 10 },
  { iso2: 'VE', nameEn: 'Venezuela', dialCode: '58', expectedDigits: 10 },
  { iso2: 'VN', nameEn: 'Vietnam', dialCode: '84', expectedDigits: 9, minDigits: 9, maxDigits: 10, groups: [3, 3, 3] },
  { iso2: 'YE', nameEn: 'Yemen', dialCode: '967', expectedDigits: 9 },
  { iso2: 'ZM', nameEn: 'Zambia', dialCode: '260', expectedDigits: 9 },
  { iso2: 'ZW', nameEn: 'Zimbabwe', dialCode: '263', expectedDigits: 9 },
];

const byIso = new Map(
  COUNTRY_SEEDS.map((seed) => [seed.iso2, defineCountry(seed)]),
);

function sortCountries(list: PhoneCountry[]): PhoneCountry[] {
  const priority = new Map(
    PRIORITY_ISO2.map((iso, index) => [iso, index]),
  );
  return [...list].sort((a, b) => {
    const pa = priority.has(a.iso2) ? priority.get(a.iso2)! : 1000;
    const pb = priority.has(b.iso2) ? priority.get(b.iso2)! : 1000;
    if (pa !== pb) return pa - pb;
    return a.nameEn.localeCompare(b.nameEn);
  });
}

export const PHONE_COUNTRIES: PhoneCountry[] = sortCountries([
  ...byIso.values(),
]);

export const DEFAULT_PHONE_COUNTRY =
  byIso.get('JP') ?? PHONE_COUNTRIES[0];

/** UI 表示: "Japan (+81)" */
export function formatPhoneCountryLabel(country: PhoneCountry): string {
  return `${country.nameEn} (+${country.dialCode})`;
}

export function findPhoneCountry(iso2: string): PhoneCountry {
  return byIso.get(iso2) ?? DEFAULT_PHONE_COUNTRY;
}

export function filterPhoneCountries(query: string): PhoneCountry[] {
  const q = query.trim().toLowerCase();
  if (!q) return PHONE_COUNTRIES;
  const dial = q.replace(/^\+/, '');
  return PHONE_COUNTRIES.filter(
    (c) =>
      c.nameEn.toLowerCase().includes(q) ||
      c.iso2.toLowerCase().includes(q) ||
      c.dialCode.includes(dial) ||
      `+${c.dialCode}`.includes(q),
  );
}
